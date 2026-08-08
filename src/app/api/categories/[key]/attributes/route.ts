import { NextResponse } from "next/server";
import { getCategoryAttributes, type Locale } from "@/lib/data/attributes";

/**
 * 카테고리별 속성 정의 (S-04 등록 폼).
 *
 * 폼이 클라이언트 컴포넌트라 route handler 로 낸다. **로그인 없이도 준다** —
 * 마스터 데이터이고 유저 콘텐츠가 아니다 (`/api/brands` 와 같은 성격).
 *
 * ⚠️ **라벨은 서버에서 로케일로 해석해 보낸다** (D-010). 어드민이 추가한
 * 카테고리 전용 속성은 메시지 파일에 없으므로 클라이언트가 번역할 수 없다.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const raw = new URL(req.url).searchParams.get("locale");
  const locale: Locale = raw === "ja" || raw === "en" ? raw : "ko";

  const attributes = await getCategoryAttributes(key, locale);

  return NextResponse.json(
    { attributes },
    {
      headers: {
        // 어드민이 A-02 에서 바꾸면 반영돼야 하므로 짧게 잡는다
        "Cache-Control": "public, max-age=60, s-maxage=300",
      },
    },
  );
}
