import type { FeedItem } from "@/components/domain/feed-card";
import type { Viewer } from "@/lib/auth/viewer";
import { normalizeBrandToken } from "@/lib/brand-search";
import { blockedUserIds, publicRoomWhere } from "@/lib/data/scope";
import { deriveItemName, NAME_SELECT } from "@/lib/data/item-name";
import { realPhotoUrl } from "@/lib/data/photo";
import { prisma } from "@/lib/prisma";

/**
 * S-08 통합 검색 — 아이템 · 도감 · 방.
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | **일기는 검색 대상이 아니다** | D-020, FR-04-A-02 |
 * | 비공개 아이템·비공개 방 제외 | D-019, FR-04-A-03 |
 * | 방은 **방 이름만**. 소개는 제외 | FR-04-A-06·07 |
 * | 언어권 필터를 적용하지 않는다 | D-027, FR-03-B-07 |
 *
 * ⚠️ **정규화는 D-014 규칙 하나만 쓴다** (`normalizeBrandToken`). 검색이
 * 자체 정규화를 들고 있으면 등록에서 연결된 도감이 검색으로는 안 나오는
 * 상태가 생긴다.
 */

/**
 * 아이템 검색.
 *
 * ⚠️ 명칭이 **파생값이라 DB 에서 LIKE 로 못 찾는다** (D-073, M-14). 브랜드명·
 * 모델·도감 명칭을 각각 매칭한 뒤 파생 명칭으로 확인한다. 명칭 컬럼을 만들면
 * 검색은 쉬워지지만 도감 병합·alias 정리 때 값이 굳는다 — 그래서 안 만든다.
 *
 * ## ⚠️ 속성값도 검색하되, 소유 정보는 뺀다 (FR-04-A-05·10·11)
 *
 * | 대상 | 검색 | 근거 |
 * |---|:---:|---|
 * | 아이템 명칭 (브랜드·모델·도감명) | O | FR-04-A-05 |
 * | 속성값 (색상·사이즈·상태·시리얼 등) | O | FR-04-A-05 |
 * | `textarea`·`url` 타입 | **✕** | FR-04-A-10, D-042 |
 * | **구매처·구매일·구매가** | **✕** | **FR-04-A-11, D-099** |
 *
 * **구매 정보를 빼는 것이 중요하다.** 아이템 상세에서 타인에게 안 보이는
 * 값인데(FR-06-A-05) 검색에 넣으면 `"명동 백화점"` 으로 검색해 남이 어디서
 * 샀는지 알아낼 수 있다. **검색은 값을 보여주지 않고도 존재를 알려준다.**
 */

/** ⚠️ 검색 대상에서 제외 — 타인에게 보이지 않는 소유 정보 (D-099, FR-04-A-11) */
const SEARCH_EXCLUDED_KEYS = ["purchasedFrom", "purchaseDate", "purchasePrice"];
/** 검색 대상에서 제외되는 타입 (FR-04-A-10, D-042) */
const SEARCH_EXCLUDED_TYPES = ["textarea", "url"] as const;
export async function searchItems(
  query: string,
  opts: { category?: string },
  viewer: Viewer | null,
): Promise<FeedItem[]> {
  const nq = normalizeBrandToken(query);
  if (!nq) return [];
  const blockedIds = await blockedUserIds(viewer);

  const rows = await prisma.item.findMany({
    where: {
      visibility: "PUBLIC",
      room: publicRoomWhere(blockedIds),
      saleStatus: { not: "SOLD" },
      ...(opts.category ? { category: { key: opts.category } } : {}),
      // DB 로 1차만 좁힌다. 정규화(공백·하이픈 제거)는 SQL 로 표현할 수 없어
      // 최종 판정은 아래에서 한다
      OR: [
        { model: { contains: query, mode: "insensitive" } },
        { brand: { name: { contains: query, mode: "insensitive" } } },
        { codexItem: { displayName: { contains: query, mode: "insensitive" } } },
        { codexItem: { normalizedKey: { contains: nq } } },
        // 유저 별칭도 찾는다 (D-112) — "출근용"으로 자기 아이템을 찾는다
        { nickname: { contains: query, mode: "insensitive" } },
        // 속성값 (FR-04-A-05). 제외 대상은 **조회 조건에서** 뺀다 —
        // 가져온 뒤 거르면 결과 수로 존재가 드러난다 (D-099)
        {
          attributeValues: {
            some: {
              value: { string_contains: query },
              categoryAttribute: {
                attributeDefinition: {
                  key: { notIn: SEARCH_EXCLUDED_KEYS },
                  type: { notIn: [...SEARCH_EXCLUDED_TYPES] },
                },
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      saleStatus: true,
      category: { select: { key: true } },
      room: { select: { id: true, name: true } },
      photos: { select: { url: true }, orderBy: { displayOrder: "asc" as const }, take: 1 },
      // 속성값으로 걸렸는지 판정용. 값 자체는 결과에 싣지 않는다
      attributeValues: {
        where: {
          value: { string_contains: query },
          categoryAttribute: {
            attributeDefinition: {
              key: { notIn: SEARCH_EXCLUDED_KEYS },
              type: { notIn: [...SEARCH_EXCLUDED_TYPES] },
            },
          },
        },
        select: { id: true },
        take: 1,
      },
      ...NAME_SELECT,
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  return rows
    .map((r) => ({ r, name: deriveItemName(r) }))
    // 명칭 매칭은 정규화까지 보고 최종 판정한다. 속성값으로 걸린 행은
    // 명칭이 안 맞아도 남긴다 — 그게 FR-04-A-05 가 요구하는 것이다
    .filter(({ r, name }) =>
      normalizeBrandToken(name).includes(nq) ||
      normalizeBrandToken(r.nickname ?? "").includes(nq) ||
      r.attributeValues.length > 0,
    )
    .map(({ r, name }) => ({
      id: r.id,
      name,
      nickname: r.nickname ?? undefined,
      categoryKey: `category.${r.category.key}`,
      roomId: r.room.id,
      roomName: r.room.name,
      onSale: r.saleStatus === "ON_SALE",
      photoUrl: realPhotoUrl(r.photos[0]?.url),
    }));
}

/**
 * 방 검색 — **방 이름만** 매칭한다 (FR-04-A-06·07).
 * 유저 소개(bio)까지 검색하면 방이 소개글로 노출된다.
 *
 * `itemCount` 는 **공개 아이템만** 센다 (FR-01-C-03). 떠난 아이템도 제외한다.
 */
export async function searchRooms(
  query: string,
  viewer: Viewer | null,
): Promise<{ id: string; name: string; level: number; itemCount: number }[]> {
  const nq = normalizeBrandToken(query);
  if (!nq) return [];
  const blockedIds = await blockedUserIds(viewer);

  const rooms = await prisma.room.findMany({
    where: {
      ...publicRoomWhere(blockedIds),
      name: { contains: query, mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      user: { select: { id: true } },
      _count: {
        select: {
          items: { where: { visibility: "PUBLIC", saleStatus: { not: "SOLD" } } },
        },
      },
    },
    take: 40,
  });

  const levels = await levelTableFor(rooms.map((r) => r.user.id));

  return rooms
    .filter((r) => normalizeBrandToken(r.name).includes(nq))
    .map((r) => ({
      id: r.id,
      name: r.name,
      level: levels.get(r.user.id) ?? 1,
      itemCount: r._count.items,
    }));
}

/** 여러 유저의 레벨을 한 번에 — 행마다 조회하면 N+1 이 된다 */
async function levelTableFor(userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const [sums, table] = await Promise.all([
    prisma.experienceLog.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _sum: { amount: true },
    }),
    prisma.levelDefinition.findMany({ orderBy: { level: "asc" } }),
  ]);
  const byUser = new Map(sums.map((s) => [s.userId, s._sum.amount ?? 0]));
  const out = new Map<string, number>();
  for (const id of userIds) {
    const total = byUser.get(id) ?? 0;
    let level = table[0]?.level ?? 1;
    for (const row of table) if (total >= row.requiredExp) level = row.level;
    out.set(id, level);
  }
  return out;
}
