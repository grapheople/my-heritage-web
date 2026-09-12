import type { TransitKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { MAX_FAVORITES } from "./constants";
import { readArrivals } from "./providers";

/**
 * 지정한 역·정류장과 **마지막 도착 스냅샷** (D-321).
 *
 * ## ⚠️ 카운트다운의 기준은 `fetchedAt` 이다
 * 포털이 주는 값은 "받은 시각 기준 남은 초" 다. 화면이 `predictSec` 를 그대로
 * 세면 페이지를 오래 열어둔 만큼 틀린다. 그래서 스냅샷에 받은 시각을 함께
 * 남기고, 화면은 **`predictSec − (지금 − fetchedAt)`** 을 센다.
 *
 * 신호등이 `greenStartAt` 으로 같은 문제를 푼 것과 같은 구조다.
 */

// 상수는 `constants.ts` 에 둔다 — 화면이 그것을 가져올 때 prisma 가 딸려오면 안 된다
export { MAX_FAVORITES, STALE_AFTER_SEC } from "./constants";

export type FavoriteView = {
  id: string;
  kind: TransitKind;
  stopId: string;
  stopName: string;
  cityCode: string;
  routeId: string;
  routeName: string;
  headsign: string | null;
  displayOrder: number;
  arrivals: {
    routeId: string;
    routeName: string;
    headsign: string | null;
    seq: number;
    /** 저장된 값 그대로 — 화면이 `fetchedAt` 으로 보정한다 */
    predictSec: number;
    stopsLeft: number | null;
    fetchedAt: string;
  }[];
};

export async function listFavorites(userId: string): Promise<FavoriteView[]> {
  const rows = await prisma.transitFavorite.findMany({
    where: { userId },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    include: { arrivals: { orderBy: [{ routeName: "asc" }, { seq: "asc" }] } },
  });
  return rows.map((f) => ({
    id: f.id,
    kind: f.kind,
    stopId: f.stopId,
    stopName: f.stopName,
    cityCode: f.cityCode,
    routeId: f.routeId,
    routeName: f.routeName,
    headsign: f.headsign,
    displayOrder: f.displayOrder,
    arrivals: f.arrivals.map((a) => ({
      routeId: a.routeId,
      routeName: a.routeName,
      headsign: a.headsign,
      seq: a.seq,
      predictSec: a.predictSec,
      stopsLeft: a.stopsLeft,
      fetchedAt: a.fetchedAt.toISOString(),
    })),
  }));
}

export async function addFavorite(
  userId: string,
  input: {
    kind: TransitKind;
    stopId: string;
    stopName: string;
    cityCode?: string;
    routeId?: string;
    routeName?: string;
    headsign?: string;
    lat?: number;
    lon?: number;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const count = await prisma.transitFavorite.count({ where: { userId } });
  if (count >= MAX_FAVORITES) {
    return { ok: false, error: `${MAX_FAVORITES}개까지 담을 수 있다` };
  }
  /*
    ⚠️ **빈 문자열이 "노선 전체" 다.** null 로 두면 Postgres 가 NULL 끼리는 서로
    다르게 보아 `@@unique` 를 빠져나간다 — 같은 정류장이 몇 번이고 담긴다
    (D-254 가 도감에서 겪은 함정).
  */
  const row = await prisma.transitFavorite.upsert({
    where: {
      userId_kind_stopId_routeId: {
        userId,
        kind: input.kind,
        stopId: input.stopId,
        routeId: input.routeId ?? "",
      },
    },
    create: {
      userId,
      kind: input.kind,
      stopId: input.stopId,
      stopName: input.stopName,
      cityCode: input.cityCode ?? "",
      routeId: input.routeId ?? "",
      routeName: input.routeName ?? "",
      headsign: input.headsign,
      lat: input.lat,
      lon: input.lon,
      displayOrder: count,
    },
    // 이미 있으면 **이름·코드만 새로 고친다** — 정류소명이 바뀌는 일이 있다
    update: {
      stopName: input.stopName,
      cityCode: input.cityCode ?? "",
      routeName: input.routeName ?? "",
      headsign: input.headsign,
    },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

export async function removeFavorite(userId: string, id: string): Promise<boolean> {
  // ⚠️ `userId` 를 조건에 **반드시** 넣는다 — id 만으로 지우면 남의 것을 지운다
  const res = await prisma.transitFavorite.deleteMany({ where: { id, userId } });
  return res.count > 0;
}

export type RefreshResult = {
  id: string;
  ok: boolean;
  reason?: "not-configured" | "not-registered" | "portal-error";
  /** `not-registered` 일 때 어느 포털 서비스인지 */
  service?: string;
  detail?: string;
  count: number;
};

/**
 * 도착정보를 **다시 받아 스냅샷을 덮어쓴다**.
 *
 * ⚠️ 한 정류장이 실패해도 나머지는 갱신한다. 하나의 404 가 전체를 멈추면 화면이
 * 통째로 빈다 — 신호등 교차로 목록에서 같은 실패를 겪었다 (D-188·D-317).
 */
export async function refreshFavorite(
  userId: string,
  id: string,
  requestedBy: string,
): Promise<RefreshResult> {
  const fav = await prisma.transitFavorite.findFirst({ where: { id, userId } });
  if (!fav) return { id, ok: false, reason: "portal-error", detail: "없는 항목", count: 0 };

  const got = await readArrivals(fav.kind, {
    stopId: fav.stopId,
    cityCode: fav.cityCode || undefined,
    routeId: fav.routeId || undefined,
  });

  /*
    ⚠️ **부르지 않은 호출을 세지 않는다.** 인증키가 없으면 `readArrivals` 는 포털에
    닿지도 않고 돌아온다 — 그것까지 집계하면 **키가 없는 동안 한도가 줄어들어**,
    키를 넣은 날 아침에 이미 상한에 걸려 있다. 신호등이 `fetched` 플래그로 같은
    구분을 둔 이유다 (D-317).
  */
  if (got.ok || got.reason === "portal-error") {
    await prisma.transitPortalCall.create({
      data: { endpoint: `${fav.kind}_ARRIVAL`, target: fav.stopId, requestedBy },
    });
  }

  if (!got.ok) {
    return {
      id,
      ok: false,
      reason: got.reason,
      service: got.reason === "not-registered" ? got.service : undefined,
      detail: got.reason === "portal-error" ? got.detail : undefined,
      count: 0,
    };
  }

  const fetchedAt = new Date();
  /*
    ⚠️ **먼저 지우고 다시 넣는다.** 노선이 끊기거나 막차가 지나면 이번 응답에 없는
    행이 생기는데, upsert 만 하면 **지난 번 값이 그대로 남아** 오지 않는 차를
    기다리게 한다.
  */
  await prisma.$transaction([
    prisma.transitArrival.deleteMany({ where: { favoriteId: fav.id } }),
    prisma.transitArrival.createMany({
      data: got.arrivals.map((a) => ({
        favoriteId: fav.id,
        routeId: a.routeId,
        routeName: a.routeName,
        headsign: a.headsign,
        seq: a.seq,
        predictSec: a.predictSec,
        stopsLeft: a.stopsLeft,
        fetchedAt,
      })),
    }),
  ]);

  return { id, ok: true, count: got.arrivals.length };
}
