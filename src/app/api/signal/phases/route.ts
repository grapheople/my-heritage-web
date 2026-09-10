import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { parseKind } from "@/lib/signal/live-target";
import { checkPortalQuota, recordPortalCalls } from "@/lib/signal/portal";
import { isLiveConfigured, readPhases } from "@/lib/signal/tdata";

/**
 * 한 교차로의 **8방위 현시** — 방위를 눈으로 특정하기 위한 것.
 *
 * `GET /api/signal/phases?itstId=12345&kind=pedestrian`
 *
 * ## ⚠️ 좌표로는 방위를 알 수 없다
 * 교차로는 좌표로 찾을 수 있지만(`/api/signal/intersections`), 내가 건너는
 * 횡단보도가 북측인지 서측인지는 중심점 좌표에 없다. 그래서 지금 이 순간의
 * 8방위 상태를 그대로 내려보내고, **눈앞의 신호와 같은 것**을 사용자가 고른다.
 * 모든 방위가 같은 상태면 한 주기 기다렸다 다시 보면 갈린다.
 *
 * 호출 1건을 쓴다 (8방위가 한 응답에 다 들어 있어 방위별로 부를 필요가 없다).
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "로그인이 필요하다" }, { status: 401, headers: NO_STORE });
  }

  const sp = new URL(req.url).searchParams;
  const itstId = sp.get("itstId")?.trim();
  if (!itstId) {
    return NextResponse.json({ error: "itstId 가 필요하다" }, { status: 400, headers: NO_STORE });
  }
  const kind = parseKind(sp.get("kind") ?? "pedestrian");
  if (!kind) {
    return NextResponse.json(
      { error: "kind 가 올바르지 않다 (pedestrian·straight·left·uturn·bus·bicycle)" },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!isLiveConfigured()) {
    return NextResponse.json(
      { error: "TDATA_API_KEY 가 없다" },
      { status: 503, headers: NO_STORE },
    );
  }

  const now = new Date();
  const gate = await checkPortalQuota(itstId, now);
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.reason, quota: gate.quota },
      { status: 429, headers: NO_STORE },
    );
  }

  let result;
  try {
    result = await readPhases(itstId, kind);
  } catch (error) {
    console.error(`[signal] ${itstId} 현시 조회 실패:`, error);
    return NextResponse.json(
      { error: "현시를 받지 못했다", detail: error instanceof Error ? error.message : undefined },
      { status: 502, headers: NO_STORE },
    );
  }
  if (result?.fetched) {
    await recordPortalCalls({
      endpoint: "SIGNAL_PHASE",
      target: itstId,
      requestedBy: viewer.userId,
    });
  }
  if (!result) {
    return NextResponse.json(
      {
        error: "이 교차로에는 해당 신호종별 필드가 없다",
        hint: "개방 대상이 아니거나 보행 신호를 내지 않는 교차로일 수 있다",
      },
      { status: 502, headers: NO_STORE },
    );
  }

  return NextResponse.json({ itstId, kind, phases: result.rows }, { headers: NO_STORE });
}
