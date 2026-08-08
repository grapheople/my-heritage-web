import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { MAX_UPLOAD_BYTES, storeImage, validateUpload } from "@/lib/storage";

/**
 * 이미지 업로드 (D-101, D-037).
 *
 * ⚠️ **로그인 필수다.** 열어두면 스토리지가 아무나 쓰는 파일 서버가 된다.
 *
 * ⚠️ **EXIF 제거는 `storeImage` 안에서 일어난다** — 여기서 통과시킨 바이트가
 * 그대로 저장되지 않는다. 위치정보가 붙은 채로 나가면 D-031 절도 리스크가
 * 실제 주소가 된다.
 *
 * 저장 경로에 아이템 id 를 쓰지 않는 이유: **등록 화면은 아직 아이템이 없다.**
 * 뷰어 id + 타임스탬프로 키를 만들고, 저장된 URL 을 폼이 들고 있다가 등록 시
 * 함께 보낸다.
 */
export const maxDuration = 30;

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
  }

  const check = validateUpload(file.type, file.size);
  if (!check.ok) {
    return NextResponse.json({ error: check.message }, { status: 400 });
  }
  // Content-Length 를 믿지 않는다 — 실제 바이트로 다시 본다
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "파일이 너무 큽니다" }, { status: 413 });
  }

  try {
    const key = `${viewer.userId}/${Date.now()}-${Math.round(bytes.byteLength)}`;
    const stored = await storeImage(bytes, key);
    return NextResponse.json(stored);
  } catch (error) {
    console.error("[upload]", error);
    return NextResponse.json({ error: "업로드에 실패했습니다" }, { status: 500 });
  }
}
