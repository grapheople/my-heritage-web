import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import {
  findIntersections,
  importIntersections,
  readCatalogState,
} from "@/lib/signal/intersections";
import { checkPortalQuota, recordPortalCalls } from "@/lib/signal/portal";
import { isLiveConfigured } from "@/lib/signal/tdata";

/**
 * 개방 대상 교차로 찾기 — "내 앞의 신호등 id" 를 푸는 화면용.
 *
 * `GET /api/signal/intersections?lat=37.5&lon=127.0`
 * `GET /api/signal/intersections?q=역삼`
 *
 * ## ⚠️ 목록은 처음 한 번만 포털에서 받는다
 * 교차로 목록 조회도 실시간 조회와 같은 하루 한도를 쓴다. 비어 있거나 오래됐을
 * 때만 수집하고, 그 뒤 검색은 **전부 DB 안에서** 끝난다 — 검색을 몇 번 하든
 * 쿼터가 줄지 않는다.
 *
 * ## ⚠️ 여기서 나오는 것은 교차로까지다
 * 방위(8방위 중 어느 횡단보도인가)는 좌표로 풀리지 않는다. `GET /api/signal/phases`
 * 로 현시를 받아 눈앞의 신호와 대조해야 한다.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
/** 목록 수집이 쓸 수 있는 최대 호출 수 (`fetchIntersectionMap` 의 페이지 상한) */
const IMPORT_BUDGET = 5;

function parseCoord(value: string | null, max: number): number | undefined {
  if (value === null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= max ? n : undefined;
}

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "로그인이 필요하다" }, { status: 401, headers: NO_STORE });
  }

  const sp = new URL(req.url).searchParams;
  const lat = parseCoord(sp.get("lat"), 90);
  const lon = parseCoord(sp.get("lon"), 180);
  const q = sp.get("q") ?? undefined;
  const limit = Number(sp.get("limit") ?? 5);
  if (lat === undefined && lon === undefined && !q?.trim()) {
    return NextResponse.json(
      { error: "lat·lon 또는 q 가 필요하다" },
      { status: 400, headers: NO_STORE },
    );
  }

  const now = new Date();
  let imported: { imported: number; requests: number } | undefined;
  const catalog = await readCatalogState(now);

  if (catalog.stale) {
    if (!isLiveConfigured()) {
      return NextResponse.json(
        {
          error: "교차로 목록이 비어 있고 TDATA_API_KEY 가 없다",
          hint: "목록은 포털에서 받아야 한다. 키가 없으면 실시간 연동 없이 3번 눌러 측정하는 방법을 쓰면 된다",
        },
        { status: 503, headers: NO_STORE },
      );
    }
    // ⚠️ 수집 **전에** 한도를 본다. 부른 뒤에 막으면 이미 쿼터는 줄었다
    const gate = await checkPortalQuota(null, now, IMPORT_BUDGET);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.reason, quota: gate.quota },
        { status: 429, headers: NO_STORE },
      );
    }
    try {
      imported = await importIntersections();
      await recordPortalCalls({
        endpoint: "CROSSROAD_MAP",
        target: null,
        requestedBy: viewer.userId,
        count: imported.requests,
      });
    } catch (error) {
      console.error("[signal] 교차로 목록 수집 실패:", error);
      return NextResponse.json(
        {
          error: "교차로 목록을 받지 못했다",
          detail: error instanceof Error ? error.message : undefined,
        },
        { status: 502, headers: NO_STORE },
      );
    }
  }

  const intersections = await findIntersections({ lat, lon, q, limit });
  return NextResponse.json(
    {
      intersections,
      catalog: {
        count: imported?.imported ?? catalog.count,
        syncedAt: (imported ? now : catalog.syncedAt)?.toISOString() ?? null,
        importedNow: !!imported,
      },
      /** 후보가 없다는 것은 **그 동네가 개방 대상이 아니라는** 뜻일 수 있다 */
      hint:
        intersections.length === 0
          ? "근처에 개방된 교차로가 없다 — 실시간 연동 없이 3번 눌러 측정하는 방법을 쓰면 된다"
          : undefined,
    },
    { headers: NO_STORE },
  );
}
