import { prisma } from "@/lib/prisma";
import { fetchIntersectionMap } from "./providers";

/**
 * 개방 대상 교차로 목록 — **수집은 어쩌다 한 번, 검색은 항상 로컬.**
 *
 * ## ⚠️ 왜 목록을 DB 에 넣는가
 * 「교차로 Map 정보」 조회도 실시간 조회와 **같은 하루 한도**를 쓴다. 화면에서
 * 검색할 때마다 부르면 검색 몇 번에 쿼터가 사라진다. 목록은 신호등이 새로
 * 생기지 않는 한 바뀌지 않으므로, 한 번 받아 두고 그 뒤 검색은 DB 안에서 끝낸다.
 */

/** 이 기간이 지나면 다시 받는다. 교차로가 새로 개방될 수 있으니 영구 캐시는 아니다 */
const STALE_DAYS = 30;

export type NearbyIntersection = {
  itstId: string;
  name: string;
  engName: string | null;
  lat: number;
  lon: number;
  /** 기준 좌표로부터의 거리 (m, 반올림) */
  distanceM: number;
};

/** 조회에서 꺼내는 열만. ⚠️ 명시해 두면 Prisma 생성 전에도 타입이 산다 */
type IntersectionRow = {
  itstId: string;
  name: string;
  engName: string | null;
  lat: number;
  lon: number;
};

export type CatalogState = {
  count: number;
  syncedAt: Date | null;
  stale: boolean;
};

export async function readCatalogState(now: Date = new Date()): Promise<CatalogState> {
  const [count, newest] = await Promise.all([
    prisma.signalIntersection.count(),
    prisma.signalIntersection.findFirst({
      orderBy: { syncedAt: "desc" },
      select: { syncedAt: true },
    }),
  ]);
  const syncedAt = newest?.syncedAt ?? null;
  const stale =
    count === 0 ||
    !syncedAt ||
    now.getTime() - syncedAt.getTime() > STALE_DAYS * 24 * 60 * 60 * 1000;
  return { count, syncedAt, stale };
}

/**
 * 목록을 받아 DB 를 **통째로 교체한다.**
 *
 * ⚠️ upsert 를 한 행씩 돌지 않는다 — 수천 행이면 왕복도 수천 번이다. 이 테이블은
 * 순수 캐시이고 다른 테이블이 참조하지 않으므로, 트랜잭션 안에서 비우고 다시
 * 넣는 편이 단순하고 빠르다. 중간 실패 시에도 트랜잭션이 옛 목록을 지켜 준다.
 */
export async function importIntersections(): Promise<{
  imported: number;
  requests: number;
}> {
  const { items, requests } = await fetchIntersectionMap();
  if (items.length === 0) return { imported: 0, requests };

  const syncedAt = new Date();
  await prisma.$transaction([
    prisma.signalIntersection.deleteMany({}),
    prisma.signalIntersection.createMany({
      data: items.map((item) => ({
        itstId: item.itstId,
        name: item.name,
        engName: item.engName ?? null,
        lat: item.lat,
        lon: item.lon,
        laneWidth: item.laneWidth ?? null,
        limitSpeed: item.limitSpeed ?? null,
        syncedAt,
      })),
      skipDuplicates: true,
    }),
  ]);
  return { imported: items.length, requests };
}

/** 두 좌표 사이 거리 (m) — 하버사인 */
function distanceMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 넓혀 가며 찾는 반경 (m).
 *
 * ⚠️ 처음부터 넓게 잡지 않는다. 서울 도심은 300m 안에 교차로가 여러 개라, 넓게
 * 잡으면 **엉뚱한 후보가 목록 위쪽을 차지한다.** 가까운 것부터 보여주고, 없을
 * 때만 넓힌다 (개방 대상이 드문 지역).
 */
const RADII_M = [400, 1_500, 6_000, 30_000];

/**
 * 좌표(또는 이름)로 교차로 후보를 찾는다. **DB 만 본다** — 포털을 부르지 않는다.
 */
export async function findIntersections(args: {
  lat?: number;
  lon?: number;
  q?: string;
  limit?: number;
}): Promise<NearbyIntersection[]> {
  const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);
  const nameFilter = args.q?.trim()
    ? { name: { contains: args.q.trim(), mode: "insensitive" as const } }
    : {};

  // 좌표가 없으면 이름 검색만 — 거리는 알 수 없으므로 0 으로 둔다
  if (args.lat === undefined || args.lon === undefined) {
    const rows: IntersectionRow[] = await prisma.signalIntersection.findMany({
      where: nameFilter,
      take: limit,
      orderBy: { name: "asc" },
      select: { itstId: true, name: true, engName: true, lat: true, lon: true },
    });
    return rows.map((row) => ({ ...row, distanceM: 0 }));
  }

  const origin = { lat: args.lat, lon: args.lon };
  for (const radius of RADII_M) {
    /*
      ⚠️ 사각형으로 먼저 좁힌 뒤 거리로 정렬한다. Postgres 에 거리 함수를
      쓰려면 PostGIS 가 필요하고(이 프로젝트에 없다), 전체를 읽어 정렬하면
      목록이 커질수록 느려진다. 인덱스(lat, lon)가 사각형 조회를 받쳐 준다.
    */
    const dLat = radius / 111_320;
    const dLon = radius / (111_320 * Math.max(0.1, Math.cos((origin.lat * Math.PI) / 180)));
    const rows: IntersectionRow[] = await prisma.signalIntersection.findMany({
      where: {
        ...nameFilter,
        lat: { gte: origin.lat - dLat, lte: origin.lat + dLat },
        lon: { gte: origin.lon - dLon, lte: origin.lon + dLon },
      },
      // 사각형 안이 아주 넓을 수 있으니 상한을 둔다 (거리 정렬은 아래에서)
      take: 200,
      select: { itstId: true, name: true, engName: true, lat: true, lon: true },
    });
    if (rows.length === 0) continue;

    return rows
      .map((row) => ({ ...row, distanceM: Math.round(distanceMeters(origin, row)) }))
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, limit);
  }
  return [];
}
