import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import sharp from "sharp";

/**
 * 이미지 스토리지 (D-101).
 *
 * ## ⚠️ EXIF 를 저장 전에 제거한다 — 이 파일에서 가장 중요한 부분
 *
 * 사진에 촬영 위치가 박혀 나가면 **D-031 에서 수용한 절도 리스크가 실제
 * 주소로 바뀐다.** 고가 시계 사진의 GPS 좌표는 "이 물건이 어디 있는지"다.
 *
 * D-078 로 도감 소유자 목록을 검색엔진에서 가린 것과 **같은 위험의 더 직접적인
 * 형태**다 — 목록은 "누가 가졌나"지만 EXIF 는 "어디 있나"다.
 *
 * `sharp` 는 기본적으로 메타데이터를 버린다. `.withMetadata()` 를 **부르지
 * 않는 것**이 제거다. 그 함수를 쓰고 싶어지면 이 주석을 다시 읽을 것.
 *
 * ## 어댑터로 감싼 이유
 * 토큰이 없어도 개발·검증이 되어야 한다. OAuth 자격증명이 없어서 비로그인
 * 경로를 몇 주간 검증하지 못했던 일(D-096 참조)을 반복하지 않는다.
 */

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
/** 저장 해상도 — 긴 변 기준. 원본은 보관하지 않는다 (D-101) */
export const MAX_EDGE = 2000;
/** 사진 최대 장수 (D-037) */
export const MAX_PHOTOS = 10;

export type StoredImage = { url: string; width: number; height: number };

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
  const image = sharp(Buffer.from(file), { failOn: "none" })
    // 회전 정보만 픽셀에 반영하고 태그는 버린다 — 안 하면 세로 사진이 눕는다
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    // ⚠️ `.withMetadata()` 를 부르지 않는다 = EXIF 제거 (D-101)
    .webp({ quality: 82 });

  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  const url = await putBytes(`${key}.webp`, data);
  return { url, width: info.width, height: info.height };
}

/**
 * 저장 백엔드.
 *
 * | 조건 | 백엔드 |
 * |---|---|
 * | `BLOB_READ_WRITE_TOKEN` 있음 | **Vercel Blob** (D-101) |
 * | 없음 + 개발 모드 | `public/uploads` — 토큰 없이도 전 경로를 검증한다 |
 * | 없음 + 프로덕션 | **던진다.** 조용히 로컬에 쓰면 배포마다 사진이 사라진다 |
 */
async function putBytes(name: string, bytes: Buffer): Promise<string> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(name, bytes, {
      access: "public",
      contentType: "image/webp",
      // 키에 이미 아이템 id 와 순번이 들어 있다 — 덮어쓰기를 막지 않으면
      // 같은 아이템을 다시 저장할 때 파일이 쌓인다
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return blob.url;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN 이 없습니다. 프로덕션에서는 로컬 저장으로 대체하지 않습니다 (D-101).",
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
