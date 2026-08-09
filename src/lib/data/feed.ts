import type { FeedItem } from "@/components/domain/feed-card";
import type { Viewer } from "@/lib/auth/viewer";
import { blockedUserIds, publicRoomWhere } from "@/lib/data/scope";
import { deriveItemName, NAME_SELECT } from "@/lib/data/item-name";
import { realPhotoUrl } from "@/lib/data/photo";
import { prisma } from "@/lib/prisma";

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
  /** `all` | `ko` | `ja` | `en` — 소유자 설정 언어 기준 (D-027, FR-03-B-02) */
  lang?: string;
  limit?: number;
};

export async function getFeed(
  filter: FeedFilter,
  viewer: Viewer | null,
): Promise<FeedItem[]> {
  const blockedIds = await blockedUserIds(viewer);
  const lang = filter.lang && filter.lang !== "all" ? filter.lang : undefined;

  // 방 조건을 한 번만 만든다 — 언어권 필터는 **소유자의 설정 언어**라서
  // 아이템이 아니라 방(→유저)에 걸린다 (D-027, FR-03-B-02)
  const room = publicRoomWhere(blockedIds);
  const roomWhere = lang
    ? { ...room, user: { ...room.user, language: lang as "ko" | "ja" | "en" } }
    : room;

  const items = await prisma.item.findMany({
    where: {
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
    nickname: i.nickname ?? undefined,
    categoryKey: `category.${i.category.key}`,
    roomId: i.room.id,
    roomName: i.room.name,
    onSale: i.saleStatus === "ON_SALE",
    photoUrl: realPhotoUrl(i.photos[0]?.url),
  }));
}
