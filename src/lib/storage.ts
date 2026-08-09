import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

/**
 * 이미지 스토리지 — **Supabase Storage** (D-114, 규칙은 D-101).
 *
 * ## ⚠️ EXIF 를 저장 전에 제거한다 — 이 파일에서 가장 중요한 부분
 *
 * 사진에 촬영 위치가 박혀 나가면 **D-031 에서 수용한 절도 리스크가 실제
 * 주소로 바뀐다.** 고가 시계 사진의 GPS 좌표는 "이 물건이 어디 있는지"다.
 *
 * D-078 로 도감 소유자 목록을 검색엔진에서 가린 것과 **같은 위험의 더 직접적인
 * 형태**다 — 목록은 "누가 가졌나"지만 EXIF 는 "어디 있나"다.
 *
 * **버킷이 공개 읽기라 접근 통제가 없다** (색인 대상 화면에 이미지가 나와야
 * 하므로, D-098·D-109). 그래서 **파일 자체에 위치정보가 없어야 한다.**
 *
 * `sharp` 는 기본적으로 메타데이터를 버린다. `.withMetadata()` 를 **부르지
 * 않는 것**이 제거다. 그 함수를 쓰고 싶어지면 이 주석을 다시 읽을 것.
 *
 * ## ⚠️ 서버 전용이다
 * `SUPABASE_SERVICE_ROLE_KEY` 는 RLS 를 우회한다. 브라우저에 닿으면 **누구나
 * 스토리지를 읽고 쓸 수 있다.** 그래서 아래 가드를 둔다 — 클라이언트 컴포넌트가
 * 이 모듈을 import 하면 빌드가 아니라 **런타임에** 터지므로, 실수를 조용히
 * 넘기지 않는다.
 */
if (typeof window !== "undefined") {
  throw new Error(
    "lib/storage.ts 는 서버 전용입니다. 서비스 롤 키가 클라이언트로 나가면 안 됩니다 (D-114).",
  );
}

/** 입력 형식 (D-101). HEIC 를 빼면 iPhone 기본 촬영본이 막힌다 */
export const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/** 원본 상한 — 최근 폰 사진이 5~8MB다 (D-101) */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/**
 * 저장 해상도 — **정방형 한 변** (D-129). 원본은 보관하지 않는다 (D-101).
 *
 * 예전에는 "긴 변 기준"이었고 비율을 유지했다. 정방형으로 바꾼 이유는 D-129 참조.
 */
export const MAX_EDGE = 2000;

/**
 * 저장본 상한 — **500KB** (D-128).
 *
 * ## ⚠️ 화질이 아니라 **비용과 체감 속도**의 문제다
 * 아이템 1건에 사진 10장(D-037)이고 방·일기까지 있다. 장당 2MB면 유저 한 명이
 * 수십 MB를 쓰고, 그 비용은 스토리지보다 **모바일 데이터와 첫 화면 로딩**에서
 * 먼저 드러난다. 피드는 카드가 수십 장 깔리는 화면이다.
 *
 * ## ⚠️ 못 맞추면 화질을 더 내린다. 업로드를 거부하지 않는다
 * "사진이 너무 커서 못 올린다"는 유저가 해결할 수 없는 실패다 — 카메라가 찍은
 * 그대로인데 무엇을 하라는 것인가. 품질을 단계적으로 낮추고, 그래도 안 되면
 * 해상도를 줄인다. **마지막 시도의 결과라도 저장한다.**
 */
export const MAX_BYTES = 500 * 1024;

/** 품질 사다리 — 위에서부터 시도한다 */
const QUALITY_STEPS = [82, 72, 62, 52, 42] as const;

/**
 * 품질을 다 내려도 안 되면 해상도를 줄인다. **시작 크기 대비 비율**이다.
 *
 * ⚠️ **절대값(2000·1600·1200)으로 두면 사다리가 접힌다.** 원본 짧은 변이
 * 1200이면 `min(step, 1200)` 이 세 단계 모두 1200이 되어 해상도가 한 번도
 * 줄지 않는다 — 실제로 1200x1200 노이즈 이미지가 **704KB** 로 나갔다.
 * 상한을 지킨다고 적어두고 안 지키는 것이 가장 나쁘다.
 */
const SCALE_STEPS = [1, 0.75, 0.55, 0.4, 0.3] as const;
/** 사진 최대 장수 (D-037) */
export const MAX_PHOTOS = 10;

/**
 * 버킷 이름.
 *
 * 아이템·일기 사진을 **한 버킷에** 둔다. 나누면 정책(공개 읽기·용량)을 두 곳에
 * 맞춰야 하는데 정책이 같다. 경로로 구분한다 — `<userId>/<timestamp>-<n>.webp`
 */
export const BUCKET = "photos";

export type StoredImage = { url: string; width: number; height: number };

/** 서비스 롤 키 — 새 형식(`sb_secret_…`)과 기존 JWT 를 모두 받는다 */
function serviceKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
}

function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
}

/** 설정돼 있는가 — 없으면 개발 모드에서 파일시스템으로 떨어진다 */
export function isRemoteStorageConfigured(): boolean {
  return Boolean(supabaseUrl() && serviceKey());
}

let cached: SupabaseClient | undefined;

export function storageClient(): SupabaseClient {
  if (cached) return cached;
  const url = supabaseUrl();
  const key = serviceKey();
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (D-114).",
    );
  }
  cached = createClient(url, key, {
    // 스토리지만 쓴다. 세션을 유지할 이유가 없다 (인증은 Auth.js, D-021)
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/**
 * 업로드된 이미지를 **WebP 로 정규화**하고 저장한다.
 *
 * 형식을 하나로 모으는 이유: 형식이 갈리면 썸네일·상세 처리 분기가 늘고,
 * HEIC 는 브라우저가 직접 렌더하지 못한다.
 */
export async function storeImage(
  file: ArrayBuffer,
  key: string,
): Promise<StoredImage> {
  const source = Buffer.from(file);
  let last: { data: Buffer; width: number; height: number } | null = null;

  // ⚠️ **원본보다 크게 만들지 않되, 정방형은 포기하지 않는다.**
  // `withoutEnlargement` 만으로는 400x300 짜리가 400x300 그대로 나온다 —
  // 크롭까지 막혀서 정방형 보장이 깨진다. 짧은 변을 상한으로 삼는다.
  //
  // `rotate()` 가 EXIF 방향을 반영하면 가로·세로가 뒤바뀔 수 있으므로,
  // **회전 후** 크기를 읽어야 한다
  const upright = await sharp(source, { failOn: "none" }).rotate().toBuffer();
  const meta = await sharp(upright).metadata();
  const shortSide = Math.min(meta.width ?? MAX_EDGE, meta.height ?? MAX_EDGE);

  // 큰 해상도·높은 품질부터 시도하고, 상한을 넘으면 낮춰간다. 대부분 첫
  // 시도에서 끝난다 — 사다리는 큰 원본을 위한 것이다
  const base = Math.min(MAX_EDGE, shortSide);
  outer: for (const scale of SCALE_STEPS) {
    // 1px 밑으로 내려가지 않게 바닥을 둔다
    const edge = Math.max(64, Math.round(base * scale));
    for (const quality of QUALITY_STEPS) {
      const { data, info } = await sharp(upright, { failOn: "none" })
        .resize({
          width: edge,
          height: edge,
          // ⚠️ **정방형으로 자른다** (D-129). 클라이언트가 이미 정방형으로
          // 보냈으면 아무 일도 일어나지 않는다. 화면(S-24 크롭 UI)만 믿으면
          // 요청을 직접 보내는 경로로 우회된다 — EXIF 제거와 같은 이유다
          fit: "cover",
          position: "centre",
        })
        // ⚠️ `.withMetadata()` 를 부르지 않는다 = EXIF 제거 (D-101)
        .webp({ quality })
        .toBuffer({ resolveWithObject: true });

      last = { data, width: info.width, height: info.height };
      if (data.byteLength <= MAX_BYTES) break outer;
    }
  }

  // 사다리를 다 내려와도 상한을 못 맞춘 경우다. **그래도 저장한다** —
  // 위 주석 참조. 거부하면 유저가 할 수 있는 일이 없다
  const out = last!;
  const url = await putBytes(`${key}.webp`, out.data);
  return { url, width: out.width, height: out.height };
}

/**
 * 저장 백엔드.
 *
 * | 조건 | 백엔드 |
 * |---|---|
 * | Supabase 설정됨 | **Supabase Storage** (D-114) |
 * | 없음 + 개발 모드 | `public/uploads` — 설정 없이도 전 경로를 검증한다 |
 * | 없음 + 프로덕션 | **던진다.** 조용히 로컬에 쓰면 배포마다 사진이 사라진다 |
 */
async function putBytes(name: string, bytes: Buffer): Promise<string> {
  if (isRemoteStorageConfigured()) {
    const client = storageClient();
    const { error } = await client.storage.from(BUCKET).upload(name, bytes, {
      contentType: "image/webp",
      // 키에 유저 id 와 타임스탬프가 들어 있다. 같은 키를 다시 쓰면 덮어쓰는 것이
      // 맞다 — 막으면 재시도가 실패한다
      upsert: true,
    });
    if (error) {
      // 버킷이 없으면 여기서 터진다 — 출시 순서에 `storage:init` 이 있는 이유다
      throw new Error(`Supabase Storage 업로드 실패: ${error.message}`);
    }
    const { data } = client.storage.from(BUCKET).getPublicUrl(name);
    return data.publicUrl;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Supabase Storage 설정이 없습니다. 프로덕션에서는 로컬 저장으로 대체하지 않습니다 (D-114).",
    );
  }

  const dir = path.join(process.cwd(), "public", "uploads", path.dirname(name));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(process.cwd(), "public", "uploads", name), bytes);
  return `/uploads/${name}`;
}

/** 업로드 전 검증 — 형식·용량 (D-101) */
export function validateUpload(
  type: string,
  size: number,
): { ok: true } | { ok: false; message: string } {
  if (!ACCEPTED_TYPES.includes(type as (typeof ACCEPTED_TYPES)[number])) {
    return { ok: false, message: "JPEG · PNG · WebP · HEIC 만 올릴 수 있어요" };
  }
  if (size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: `사진은 장당 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB 까지예요` };
  }
  return { ok: true };
}
