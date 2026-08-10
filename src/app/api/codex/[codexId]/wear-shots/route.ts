import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { getCodexWearShots } from "@/lib/data/wear-shot";

/**
 * 도감 착용샷 목록 — **클라이언트 전용 엔드포인트** (D-162, D-078 상속).
 *
 * ## 왜 서버 컴포넌트에서 조회하지 않는가
 *
 * 도감 상세는 검색엔진 색인 대상이다. 이 목록을 서버 컴포넌트에서 가져오면
 * **HTML 응답 본문에 실려 크롤러가 읽는다.** 화면에서 조건부로 감춰도 소용없다
 * — 응답에 이미 있다.
 *
 * 이 목록은 소유자 목록을 대체한 것이고 **노출은 더 강하다**: 사진 · 방 이름 ·
 * 날짜가 함께 나간다. "고가 시계를 실제로 착용한 사진 + 소유자 방"이 색인되면
 * **D-031 에서 수용한 절도 리스크가 검색엔진 규모로 커진다.**
 *
 * ## 로그인을 요구하는 이유
 *
 * 이 섹션은 **누가 가졌는지를 드러낸다** — 방 이름과 링크가 붙는다. 소유자
 * 목록에 로그인 게이트를 둔 근거(FR-07-A-07)가 그대로 적용된다. 게이트를 풀면
 * 옛 소유자 목록보다 **더 많은 정보를 비로그인에게 주는 것**이 된다.
 *
 * ## 캐시하지 않는 이유
 *
 * 차단 관계인 유저의 착용샷은 제외되므로 **결과가 조회 유저마다 다르다**
 * (E-07-07, D-051). 유저별 결과라 애초에 캐시할 수 없다.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ codexId: string }> },
) {
  const viewer = await getViewer();
  if (!viewer) {
    // 비로그인에게는 목록도 개수도 주지 않는다 (FR-07-A-07 과 같은 기준)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { codexId } = await params;
  // 차단 관계는 여기서 빠진다 — 그래서 결과가 조회 유저마다 다르다 (E-07-07)
  const shots = await getCodexWearShots(codexId, viewer);

  return NextResponse.json(
    { shots, count: shots.length },
    // 유저별 결과다 — 절대 공용 캐시에 올리지 않는다 (E-07-07)
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
