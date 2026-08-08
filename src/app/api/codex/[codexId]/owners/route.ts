import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { getCodexOwners } from "@/lib/data/codex";

/**
 * 도감 소유자 목록 — **클라이언트 전용 엔드포인트** (D-078, FR-07-A-08).
 *
 * ## 왜 서버 컴포넌트에서 조회하지 않는가
 *
 * 도감 상세는 검색엔진 색인 대상이다. 소유자 목록을 서버 컴포넌트에서
 * 가져오면 **HTML 응답 본문에 실려 크롤러가 읽는다.** 화면에서 조건부로
 * 감춰도 소용없다 — 응답에 이미 있다.
 *
 * 그러면 구글에 "고가 시계 보유자 목록"이 색인되고, **D-031 에서 수용한
 * 절도 리스크가 검색엔진 규모로 커진다.** 그것을 막는 것이 D-078 이다.
 *
 * ## 캐시하지 않는 이유
 *
 * 차단 관계인 유저는 목록·보유자 수에서 제외되므로 **보유자 수가 조회
 * 유저마다 다르다** (E-07-07, D-051). 유저별 결과라 애초에 캐시할 수 없다.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ codexId: string }> },
) {
  const viewer = await getViewer();
  if (!viewer) {
    // 비로그인에게는 목록도 개수도 주지 않는다 (FR-07-A-07)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { codexId } = await params;
  // 차단 관계는 여기서 빠진다 — 그래서 값이 조회 유저마다 다르다 (E-07-07)
  const owners = await getCodexOwners(codexId, viewer);

  return NextResponse.json(
    { owners, count: owners.length },
    // 유저별 결과다 — 절대 공용 캐시에 올리지 않는다 (E-07-07)
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
