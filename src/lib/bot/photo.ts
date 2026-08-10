import { createHash } from "node:crypto";
import sharp from "sharp";
import { storeImage } from "@/lib/storage";

/**
 * 봇 아이템용 플레이스홀더 사진 (D-146).
 *
 * ## ⚠️ 왜 사진을 만들어야 하는가
 * 아이템은 **사진 1장이 필수**다 (D-037, FR-07-A-03). 봇에게는 사진이 없으므로
 * 만들어 넣는다. **그 검증을 봇만 우회하게 하지 않는다** — 규칙을 예외로
 * 뚫으면 나중에 사람도 그 구멍으로 들어온다.
 *
 * ## ⚠️ 실제 제품처럼 보이게 만들지 않는다
 * 그럴듯한 제품 사진을 합성하면 **유저를 속이는 것**이고, 마켓에서 그 사진을
 * 근거로 거래를 판단하게 된다 (D-046). 그래서 **한눈에 플레이스홀더인 추상
 * 이미지**를 만든다 — 이름 해시로 색을 정해 아이템마다 다르게 보이되,
 * 물건처럼 보이지는 않는다.
 *
 * ## ⚠️ 디코더에 의존하지 않는다 (D-152)
 * SVG 입력은 libvips 에 **librsvg 가 함께 빌드돼 있어야** 동작한다. `raw`
 * 픽셀 버퍼는 디코더가 필요 없어 어떤 sharp 빌드에서도 동작한다.
 *
 * ## ⚠️ 그래서 시딩 목적을 절반만 달성한다
 * "서비스가 살아 보이게" 하려면 결국 **실제 사진**이 필요하다. 봇은 문장과
 * 구조를 채울 뿐이다 — 그 한계를 알고 써야 한다.
 *
 * 저장은 일반 경로(`storeImage`)를 그대로 탄다 — 정방형·500KB 이하·EXIF 제거가
 * 봇 사진에도 똑같이 적용된다 (D-128·D-129).
 */
const SIZE = 1200;
/** 그라디언트 원본 격자. 작게 만들어 확대하면 부드러운 면이 된다 */
const SEED_GRID = 8;

/**
 * ⚠️ **SVG 를 쓰지 않는다** (D-152).
 *
 * 초판은 SVG 문자열을 `sharp` 에 넣어 PNG 로 바꿨다. 그런데 SVG 입력은
 * **libvips 에 librsvg 가 함께 빌드돼 있어야** 동작한다 — 없으면
 * `Input buffer contains unsupported image format` 로 터진다. 실제로 그
 * 오류가 보고됐다.
 *
 * `raw` 픽셀 버퍼는 **디코더가 필요 없다.** 어떤 sharp 빌드에서도 동작한다.
 */
function gradientBuffer(h: Buffer): Buffer {
  // 대각선 그라디언트 두 색 — 채도를 낮게 묶는다 (무채색 방향 D-079)
  const base = 150 + (h[0] % 60); // 150~209
  const tint = h[1] % 3; // 어느 채널을 살짝 올릴지
  const px = Buffer.alloc(SEED_GRID * SEED_GRID * 3);
  for (let y = 0; y < SEED_GRID; y++) {
    for (let x = 0; x < SEED_GRID; x++) {
      // 좌상 → 우하로 어두워진다
      const t = (x + y) / (2 * (SEED_GRID - 1));
      const v = Math.round(base - t * 45);
      const i = (y * SEED_GRID + x) * 3;
      px[i] = v;
      px[i + 1] = v;
      px[i + 2] = v;
      // 한 채널만 6 올려 미세한 색조를 준다 — 아이템마다 달라 보이되 튀지 않는다
      px[i + tint] = Math.min(255, v + 6);
    }
  }
  return px;
}

export async function makeBotPhoto(
  seed: string,
  userId: string,
): Promise<string> {
  // 같은 아이템이면 같은 이미지가 나온다 — 재실행이 색을 바꾸지 않는다
  const h = createHash("sha256").update(seed).digest();

  let png: Buffer;
  try {
    png = await sharp(gradientBuffer(h), {
      raw: { width: SEED_GRID, height: SEED_GRID, channels: 3 },
    })
      // 작은 격자를 확대해 부드러운 면을 만든다. 디코더가 개입하지 않는다
      .resize(SIZE, SIZE, { kernel: "cubic" })
      .png()
      .toBuffer();
  } catch (e) {
    // ⚠️ 어느 단계가 죽었는지 남긴다. "사진 실패"만 뜨면 생성인지 업로드인지
    // 구분할 수 없다 (D-150 에서 같은 문제를 겪었다)
    throw new Error(`이미지 생성 실패 — ${(e as Error).message}`);
  }

  const ab = png.buffer.slice(
    png.byteOffset,
    png.byteOffset + png.byteLength,
  ) as ArrayBuffer;

  const key = `${userId}/bot-${h.toString("hex").slice(0, 12)}`;
  try {
    const stored = await storeImage(ab, key);
    return stored.url;
  } catch (e) {
    throw new Error(`업로드 실패 — ${(e as Error).message}`);
  }
}
