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
 * ## ⚠️ 그래서 시딩 목적을 절반만 달성한다
 * "서비스가 살아 보이게" 하려면 결국 **실제 사진**이 필요하다. 봇은 문장과
 * 구조를 채울 뿐이다 — 그 한계를 알고 써야 한다.
 *
 * 저장은 일반 경로(`storeImage`)를 그대로 탄다 — 정방형·500KB 이하·EXIF 제거가
 * 봇 사진에도 똑같이 적용된다 (D-128·D-129).
 */
const SIZE = 1200;

export async function makeBotPhoto(
  seed: string,
  userId: string,
): Promise<string> {
  // 같은 아이템이면 같은 이미지가 나온다 — 재실행이 색을 바꾸지 않는다
  const h = createHash("sha256").update(seed).digest();
  // 채도를 낮게 묶는다. 무채색 방향(D-079)에서 튀지 않아야 한다
  const hue = h[0] * 1.41; // 0~360
  const light = 62 + (h[1] % 18); // 62~79%

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="hsl(${hue.toFixed(0)} 12% ${light}%)"/>
        <stop offset="100%" stop-color="hsl(${((hue + 40) % 360).toFixed(0)} 10% ${(light - 12).toFixed(0)}%)"/>
      </linearGradient>
    </defs>
    <rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>
    <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE * 0.22}"
            fill="none" stroke="rgba(255,255,255,.5)" stroke-width="3"/>
    <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE * 0.3}"
            fill="none" stroke="rgba(0,0,0,.08)" stroke-width="2"/>
  </svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const ab = png.buffer.slice(
    png.byteOffset,
    png.byteOffset + png.byteLength,
  ) as ArrayBuffer;

  const key = `${userId}/bot-${h.toString("hex").slice(0, 12)}`;
  const stored = await storeImage(ab, key);
  return stored.url;
}
