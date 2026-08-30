import type { FeedItem } from "@/components/domain/feed-card";
import type { Viewer } from "@/lib/auth/viewer";
import { blockedUserIds, publicRoomWhere } from "@/lib/data/scope";
import { deriveItemName, NAME_SELECT } from "@/lib/data/item-name";
import { realPhotoUrl } from "@/lib/data/photo";
import { prisma } from "@/lib/prisma";
import { DISPLAYABLE_ITEM } from "@/lib/item-display";
import { allLanguages } from "@/lib/language-scope";

/**
 * S-01 NEW 피드.
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | **아이템 등록 시각** 역순 | D-070, FR-03-A-01 |
 * | 공개 전환·판매완료 복귀로 정렬 시각을 갱신하지 않는다 | D-070, FR-03-A-09 |
 * | 팔로우와 무관하게 전체 유저 | D-006, FR-03-A-02 |
 * | 비공개 아이템·비공개 방 제외 | D-019, FR-03-A-04 |
 * | 차단 관계 제외 | D-051, FR-03-A-08 |
 * | 카테고리 + 언어권 필터 동시 적용 | D-082, FR-03-B-06 |
 *
 * ⚠️ **정렬은 `createdAt` 이어야 한다.** `updatedAt` 을 쓰면 비공개→공개 전환만
 * 해도 피드 맨 위로 올라와 FR-03-A-09 가 깨진다. 오래된 아이템을 껐다 켜는 것이
 * 노출 수단이 되면 안 된다.
 */
export type FeedFilter = {
  category?: string;
  /**
   * 여러 카테고리 (D-124 선호 카테고리). `category` 가 있으면 그쪽이 이긴다 —
   * 유저가 화면에서 직접 고른 것이기 때문이다 (FR-09-B-06)
   */
  categories?: string[];
  /**
   * **관심 언어권 집합** — 소유자 설정 언어 기준 (D-027·D-274, FR-03-B-02).
   *
   * ⚠️ **빈 배열은 "전체"** 다. `{ in: [] }` 는 아무것도 매칭하지 않아 피드가
   * 통째로 비어버린다 — D-069·D-109 가 동시에 깨진다. `myLanguages()` 가
   * 애초에 빈 배열을 내지 않지만 여기서도 `length > 0` 을 확인한다
   */
  languages?: string[];
  /**
   * **팔로우한 방만** (D-175, OI-86 해소).
   *
   * ⚠️ 관계로 좁힌다 — 팔로우 id 를 먼저 모아 `in` 으로 넣지 않는다. 팔로우가
   * 수천 건이면 그 배열이 쿼리에 그대로 실린다.
   *
   * ⚠️ **비로그인이면 결과가 0 이다.** 그것이 맞다 — 로그인 유도는 화면이 한다.
   */
  following?: boolean;
  limit?: number;
};

export async function getFeed(
  filter: FeedFilter,
  viewer: Viewer | null,
): Promise<FeedItem[]> {
  const blockedIds = await blockedUserIds(viewer);
  /*
    ⚠️ **전 언어권이면 조건을 걸지 않는다.** `{ in: ["ko","ja","en"] }` 도
    결과는 같지만 방(→유저) 조인을 강제해 쓸데없이 무겁다 — 아래 `roomWhere`
    가 조건 유무로 조인을 가른다
  */
  const all = allLanguages();
  const langs =
    filter.languages?.length && filter.languages.length < all.length
      ? filter.languages
      : undefined;

  // 방 조건을 한 번만 만든다 — 언어권 필터는 **소유자의 설정 언어**라서
  // 아이템이 아니라 방(→유저)에 걸린다 (D-027, FR-03-B-02)
  const room = publicRoomWhere(blockedIds);
  const userWhere = {
    ...room.user,
    ...(langs ? { language: { in: langs as ("ko" | "ja" | "en")[] } } : {}),
    /*
      팔로우한 방만 (D-175). `viewer` 가 없으면 **아무것도 매칭되지 않는 조건**을
      넣는다 — 조건을 빼면 전체가 나와서 탭이 무의미해진다.
    */
    ...(filter.following
      ? { followers: { some: { followerId: viewer?.userId ?? "" } } }
      : {}),
  };
  const roomWhere =
    langs || filter.following ? { ...room, user: userWhere } : room;

  const items = await prisma.item.findMany({
    where: {
      // ⚠️ **전시 단위 판정은 한 곳에서 온다** (D-211·D-221) — 조건을 여기 적지 않는다
      ...DISPLAYABLE_ITEM,
      visibility: "PUBLIC",
      room: roomWhere,
      // 떠난 아이템은 피드에 올리지 않는다 (D-023).
      // ⚠️ Spec 이 명시하지 않은 지점이다 — OI-55
      saleStatus: { not: "SOLD" },
      ...(filter.category
        ? { category: { key: filter.category } }
        : filter.categories?.length
          ? { category: { key: { in: filter.categories } } }
          : {}),
    },
    select: {
      id: true,
      saleStatus: true,
      category: { select: { key: true } },
      room: { select: { id: true, name: true } },
      photos: { select: { url: true }, orderBy: { displayOrder: "asc" as const }, take: 1 },
      ...NAME_SELECT,
    },
    orderBy: { createdAt: "desc" },
    take: filter.limit ?? 60,
  });

  return items.map((i) => ({
    id: i.id,
    name: deriveItemName(i),
    categoryKey: `category.${i.category.key}`,
    roomId: i.room.id,
    roomName: i.room.name,
    onSale: i.saleStatus === "ON_SALE",
    photoUrl: realPhotoUrl(i.photos[0]?.url),
  }));
}
