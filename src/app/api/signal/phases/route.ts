import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { parseKind } from "@/lib/signal/live-target";
import { checkPortalQuota, recordPortalCalls } from "@/lib/signal/portal";
import { prisma } from "@/lib/prisma";
import { isLiveConfigured, readPhases } from "@/lib/signal/providers";

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

  /*
    ⚠️ 좌표를 **먼저 찾아 넘긴다.** 없으면 파사드가 제공자를 전부 부르고, 관계없는
    포털의 타임아웃까지 유저가 기다린다 (울산 교차로에 9.4초가 들었다).
    목록을 이미 DB 에 갖고 있으므로 조회 1회면 된다.
  */
  const known = await prisma.signalIntersection.findUnique({
    where: { itstId },
    select: { lat: true, lon: true },
  });

  let result;
  try {
    result = await readPhases(itstId, kind, known ? { lat: known.lat, lon: known.lon } : undefined);
  } catch (error) {
    console.error(`[signal] ${itstId} 현시 조회 실패:`, error);
    return NextResponse.json(
      { error: "현시를 받지 못했다", detail: error instanceof Error ? error.message : undefined },
      { status: 502, headers: NO_STORE },
    );
  }
  if (result.ok) {
    if (result.fetched) {
      await recordPortalCalls({
        endpoint: "SIGNAL_PHASE",
        target: itstId,
        requestedBy: viewer.userId,
      });
    }
    return NextResponse.json({ itstId, kind, phases: result.rows }, { headers: NO_STORE });
  }

  /*
    ⚠️ **사유마다 유저가 할 수 있는 일이 다르다.** 전부 502 "필드가 없다" 로 뭉치면
    포털 장애일 때도 유저가 교차로를 계속 바꿔 보게 된다 — 그때마다 15초다.
  */
  if (result.reason === "kind-empty") {
    return NextResponse.json(
      {
        error: "이 교차로는 이 신호종별 정보를 주지 않는다",
        // 같은 응답에 들어 있던 값이라 **추가 호출 없이** 대안을 말할 수 있다
        kinds: result.kinds,
        hint:
          result.kinds.length > 0
            ? "다른 신호종별로 방위를 맞춘 뒤 보행 시간은 3번 눌러 측정하면 된다"
            : "실시간 연동 없이 3번 눌러 측정하는 방법을 쓰면 된다",
      },
      { status: 404, headers: NO_STORE },
    );
  }
  if (result.reason === "portal-error") {
    // ⚠️ 우리 잘못이 아니라는 것을 **로그와 화면 양쪽에** 남긴다
    console.error(`[signal] ${itstId} 현시 조회 — 포털 실패:`, result.failures);
    return NextResponse.json(
      {
        error: "신호 포털이 응답하지 않는다",
        hint: "잠시 뒤 다시 시도하거나, 3번 눌러 측정하는 방법을 쓰면 된다",
        detail: result.failures,
      },
      { status: 503, headers: NO_STORE },
    );
  }
  return NextResponse.json(
    {
      error: "이 교차로는 실시간 개방 대상이 아니다",
      hint: "실시간 연동 없이 3번 눌러 측정하는 방법을 쓰면 된다",
    },
    { status: 404, headers: NO_STORE },
  );
}
