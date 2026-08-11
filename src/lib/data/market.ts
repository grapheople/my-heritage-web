import type { MarketListing } from "@/lib/data/types";
import type { Viewer } from "@/lib/auth/viewer";
import type { CurrencyCode } from "@/lib/format";
import { blockedUserIds, publicRoomWhere } from "@/lib/data/scope";
import { deriveItemName, NAME_SELECT } from "@/lib/data/item-name";
import { realPhotoUrl } from "@/lib/data/photo";
import { prisma } from "@/lib/prisma";

/**
 * S-09 마켓 — 판매중 아이템.
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 판매중 + 아이템 공개 + **방 공개** | D-019, FR-02-A-01·02 |
 * | 기본 정렬 = **판매 전환 시각** 역순 | D-048, FR-02-A-03 |
 * | 가격은 판매자 통화 그대로. **환산 없음** | D-011, FR-02-A-05 |
 * | 가격순은 **단일 통화 선택 시에만** | D-048, FR-02-C-01 |
 *
 * ⚠️ **정렬 기준이 `onSaleAt` 인 이유**: `createdAt` 은 등록 시각이라 오래
 * 전에 등록한 물건을 지금 판매 전환해도 뒤로 밀리고, `updatedAt` 은 사진만
 * 고쳐도 앞으로 온다. 둘 다 "방금 올라온 매물"을 뜻하지 않는다.
 * 이 필드가 없어서 2026-08-08에 스키마에 추가했다.
 */
export type MarketFilter = {
  category?: string;
  currency?: string;
  sort?: "recent" | "price";
  limit?: number;
};

export async function getMarketListings(
  filter: MarketFilter,
  viewer: Viewer | null,
): Promise<MarketListing[]> {
  const blockedIds = await blockedUserIds(viewer);
  // 통화가 없으면 가격순을 쓸 수 없다 — 환율을 쓰지 않기 때문 (D-011, FR-02-C-01)
  const sort = filter.sort === "price" && filter.currency ? "price" : "recent";

  const rows = await prisma.item.findMany({
    where: {
      saleStatus: "ON_SALE",
      visibility: "PUBLIC",
      room: publicRoomWhere(blockedIds),
      /*
        ⚠️ **판매할 수 없는 카테고리는 조회에서 뺀다** (D-173, OI-85).
        전환 액션이 막고 있어도(`actions/sell.ts`) **이미 ON_SALE 인 행이 남아
        있을 수 있다** — 카테고리를 나중에 `sellable: false` 로 바꾸는 경우다.
        화면에서 거르지 않고 **조회 조건**에 둔다 (D-083 과 같은 기준).
      */
      category: {
        sellable: true,
        ...(filter.category ? { key: filter.category } : {}),
      },
      ...(filter.currency
        ? { currency: filter.currency as CurrencyCode }
        : {}),
    },
    select: {
      id: true,
      price: true,
      currency: true,
      category: { select: { key: true } },
      room: { select: { id: true, name: true } },
      photos: { select: { url: true }, orderBy: { displayOrder: "asc" as const }, take: 1 },
      ...NAME_SELECT,
    },
    orderBy:
      sort === "price"
        ? { price: "asc" }
        // 아직 전환 시각이 없는 기존 행은 뒤로 보낸다
        : [{ onSaleAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: filter.limit ?? 60,
  });

  return rows.flatMap((r) => {
    // 판매중인데 가격·통화가 없으면 매물로 성립하지 않는다 (D-050 — 3개 필수).
    // 데이터가 깨진 경우이므로 조용히 건너뛰고 목록을 지키는 쪽을 택한다
    if (r.price === null || r.currency === null) return [];
    return [
      {
        id: r.id,
        name: deriveItemName(r),
        categoryKey: `category.${r.category.key}`,
        roomId: r.room.id,
        roomName: r.room.name,
        // Decimal → number. 표시는 통화별 소수 규칙을 formatPrice 가 처리한다
        price: Number(r.price),
        currency: r.currency,
        photoUrl: realPhotoUrl(r.photos[0]?.url),
      },
    ];
  });
}
