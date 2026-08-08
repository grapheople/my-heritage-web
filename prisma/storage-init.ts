import "./env";
import {
  ACCEPTED_TYPES, BUCKET, isRemoteStorageConfigured, MAX_UPLOAD_BYTES, storageClient,
} from "../src/lib/storage";

/**
 * 스토리지 버킷 생성 (`pnpm storage:init`, D-114).
 *
 * ## ⚠️ 출시 순서에 들어간다
 * 버킷이 없으면 **업로드가 전부 실패한다.** 아이템은 사진 1장이 필수라(D-037)
 * 유저가 아무것도 등록할 수 없다 — D-097 의 A-02 조합과 같은 성격의 블로커다.
 *
 * ## ⚠️ 공개 읽기 버킷이다
 * 도감·마켓·홈이 색인 대상이라(D-098·D-109) 크롤러가 이미지를 읽어야 한다.
 * 즉 **URL 을 아는 사람은 누구나 볼 수 있다.** 접근 통제가 없는 대신
 * **파일 자체에 EXIF 가 없어야 한다** (D-101 — `storeImage` 가 제거한다).
 *
 * 멱등하다 — 이미 있으면 정책만 맞춘다.
 */
async function main() {
  if (!isRemoteStorageConfigured()) {
    console.error(
      "❌ NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.",
    );
    process.exit(1);
  }

  const client = storageClient();
  const { data: buckets, error: listError } = await client.storage.listBuckets();
  if (listError) {
    console.error(`❌ 버킷 목록 조회 실패: ${listError.message}`);
    process.exit(1);
  }

  const options = {
    public: true, // 색인 대상 화면에 이미지가 나와야 한다 (D-098·D-109)
    fileSizeLimit: MAX_UPLOAD_BYTES,
    // 저장은 WebP 단일이지만, 서버가 변환하기 전 원본 형식도 허용해야 한다
    allowedMimeTypes: [...ACCEPTED_TYPES, "image/webp"],
  };

  const existing = buckets?.find((b) => b.name === BUCKET);
  if (existing) {
    const { error } = await client.storage.updateBucket(BUCKET, options);
    if (error) {
      console.error(`❌ 버킷 정책 갱신 실패: ${error.message}`);
      process.exit(1);
    }
    console.log(`  ✅ 버킷 "${BUCKET}" 이미 있음 — 정책 갱신`);
  } else {
    const { error } = await client.storage.createBucket(BUCKET, options);
    if (error) {
      console.error(`❌ 버킷 생성 실패: ${error.message}`);
      process.exit(1);
    }
    console.log(`  ✅ 버킷 "${BUCKET}" 생성`);
  }

  console.log(`     공개 읽기 · 장당 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB 상한`);
  console.log("     ⚠️ 공개 버킷이므로 EXIF 제거가 유일한 위치정보 보호다 (D-101)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
