import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import {
  addFavorite,
  listFavorites,
  removeFavorite,
  setRouteHidden,
} from "@/lib/transit/favorites";

/**
 * 지정한 역·정류장 담기·빼기·목록 (D-321).
 *
 * ```
 * GET    /api/transit/favorites
 * POST   /api/transit/favorites   { kind, stopId, stopName, cityCode?, routeId?, … }
 * PATCH  /api/transit/favorites   { id, routeId, routeName, hidden }   — 노선 숨김·되돌리기
 * DELETE /api/transit/favorites?id=…
 * ```
 *
 * ⚠️ **유저마다 다르다.** 신호등(`SignalLightLive`)은 전역 하나를 공유하지만 —
 * 제품이 1인용이던 시절의 모양이다 — 출근길 정류장은 사람마다 다르다 (OI-121).
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "로그인이 필요하다" }, { status: 401, headers: NO_STORE });
  }
  return NextResponse.json(
    { favorites: await listFavorites(viewer.userId) },
    { headers: NO_STORE },
  );
}

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "로그인이 필요하다" }, { status: 401, headers: NO_STORE });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "본문이 JSON 이 아니다" }, { status: 400, headers: NO_STORE });
  }

  const kind = body.kind === "SUBWAY" ? "SUBWAY" : body.kind === "BUS" ? "BUS" : null;
  const stopId = typeof body.stopId === "string" ? body.stopId.trim() : "";
  const stopName = typeof body.stopName === "string" ? body.stopName.trim() : "";
  if (!kind || !stopId || !stopName) {
    return NextResponse.json(
      { error: "kind·stopId·stopName 이 필요하다" },
      { status: 400, headers: NO_STORE },
    );
  }
  /*
    ⚠️ 버스는 `cityCode` 없이 도착정보를 받을 수 없다. 담을 때 놓치면 **나중에 다시
    알아낼 방법이 정류소를 또 검색하는 것뿐**이라 여기서 막는다.
  */
  const cityCode = typeof body.cityCode === "string" ? body.cityCode.trim() : "";
  if (kind === "BUS" && !cityCode) {
    return NextResponse.json(
      { error: "버스 정류장은 cityCode 가 필요하다", hint: "검색 결과의 항목을 그대로 보내라" },
      { status: 400, headers: NO_STORE },
    );
  }

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const numOr = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

  const res = await addFavorite(viewer.userId, {
    kind,
    stopId,
    stopName,
    cityCode,
    routeId: str(body.routeId),
    routeName: str(body.routeName),
    headsign: str(body.headsign),
    lat: numOr(body.lat),
    lon: numOr(body.lon),
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 409, headers: NO_STORE });

  return NextResponse.json(
    { id: res.id, favorites: await listFavorites(viewer.userId) },
    { headers: NO_STORE },
  );
}

export async function DELETE(req: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "로그인이 필요하다" }, { status: 401, headers: NO_STORE });
  }
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "id 가 필요하다" }, { status: 400, headers: NO_STORE });
  }
  const removed = await removeFavorite(viewer.userId, id);
  if (!removed) {
    return NextResponse.json({ error: "없는 항목이다" }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json(
    { favorites: await listFavorites(viewer.userId) },
    { headers: NO_STORE },
  );
}

/**
 * 노선 숨김·되돌리기 (D-324).
 *
 * ⚠️ **삭제(`DELETE`)와 다른 동작이다.** 숨김은 카운트다운에서 빼는 것이고,
 * 숨긴 목록에 남아 언제든 되돌릴 수 있다.
 */
export async function PATCH(req: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "로그인이 필요하다" }, { status: 401, headers: NO_STORE });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "본문이 JSON 이 아니다" }, { status: 400, headers: NO_STORE });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const routeId = typeof body.routeId === "string" ? body.routeId.trim() : "";
  const routeName = typeof body.routeName === "string" ? body.routeName.trim() : routeId;
  if (!id || !routeId || typeof body.hidden !== "boolean") {
    return NextResponse.json(
      { error: "id·routeId·hidden 이 필요하다" },
      { status: 400, headers: NO_STORE },
    );
  }

  const ok = await setRouteHidden(viewer.userId, {
    favoriteId: id,
    routeId,
    routeName,
    hidden: body.hidden,
  });
  if (!ok) {
    return NextResponse.json({ error: "없는 항목이다" }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json(
    { favorites: await listFavorites(viewer.userId) },
    { headers: NO_STORE },
  );
}
