import type { CodexAttr, ItemDetail } from "@/lib/data/types";
import type { Viewer } from "@/lib/auth/viewer";
import type { CurrencyCode } from "@/lib/format";
import { blockedUserIds } from "@/lib/data/scope";
import { realPhotoUrl } from "@/lib/data/photo";
import { levelOf } from "@/lib/data/level";
import { deriveItemName, NAME_SELECT } from "@/lib/data/item-name";
import { prisma } from "@/lib/prisma";

/**
 * S-05 아이템 상세.
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 공개 판정은 **방 AND 아이템** | D-019, M-06 |
 * | 구매처·구매일·구매가는 **소유자에게만** | D-019, FR-06-A-05 |
 * | 활성 속성값만. 빈 값은 렌더하지 않는다 | D-036, FR-06-A-01·02 |
 * | 명칭은 파생값 | D-073, M-14 |
 * | 연결된 **공개** 일기 | FR-06-A-04 |
 */

/** ⚠️ 타인에게 보이면 안 되는 소유 정보 (FR-06-A-05) */
const OWNER_ONLY_KEYS = new Set(["purchasedFrom", "purchaseDate", "purchasePrice"]);

/** 속성값 Json → 표시 문자열. multiselect 는 배열, boolean 은 진짜 boolean 이다 */
function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export async function getItemDetail(
  itemId: string,
  viewer: Viewer | null,
): Promise<ItemDetail | null> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      visibility: true,
      saleStatus: true,
      price: true,
      currency: true,
      externalUrl: true,
      codexItemId: true,
      category: { select: { key: true } },
      room: {
        select: { id: true, name: true, visibility: true, userId: true, user: { select: { deletedAt: true } } },
      },
      photos: { select: { url: true }, orderBy: { displayOrder: "asc" } },
      attributeValues: {
        select: {
          value: true,
          categoryAttribute: {
            select: {
              active: true,
              displayOrder: true,
              attributeDefinition: { select: { key: true, type: true } },
            },
          },
        },
      },
      ...NAME_SELECT,
    },
  });
  if (!item || item.room.user.deletedAt) return null;

  const owner = viewer?.roomId === item.room.id;

  if (!owner) {
    // 차단 관계면 존재 자체를 숨긴다 (D-051)
    const blockedIds = await blockedUserIds(viewer);
    if (blockedIds.includes(item.room.userId)) return null;
    // 방 AND 아이템 둘 다 공개여야 한다 (D-019, M-06)
    if (item.room.visibility !== "PUBLIC" || item.visibility !== "PUBLIC") return null;
  }

  const values = item.attributeValues
    // 비활성 속성은 값이 보존되지만 **표시에서 제외**된다 (D-036, M-09)
    .filter((v) => v.categoryAttribute.active)
    .sort((a, b) => a.categoryAttribute.displayOrder - b.categoryAttribute.displayOrder);

  const attrs: CodexAttr[] = [];
  const ownerInfo: ItemDetail["owner"] = {};
  let refUrl: string | undefined;

  for (const v of values) {
    const key = v.categoryAttribute.attributeDefinition.key;
    const text = displayValue(v.value);
    if (!text) continue; // 값이 빈 항목은 렌더하지 않는다 (FR-06-A-02)

    if (OWNER_ONLY_KEYS.has(key)) {
      // ⚠️ 타인에게는 **응답에 넣지 않는다.** 화면에서 감추는 것이 아니다
      if (owner) {
        if (key === "purchasedFrom") ownerInfo.purchasedFrom = text;
        if (key === "purchaseDate") ownerInfo.purchaseDate = text;
        if (key === "purchasePrice") ownerInfo.purchasePrice = text;
      }
      continue;
    }
    if (key === "referenceUrl") {
      // 외부 링크는 경고를 경유해야 한다 (D-040) — 별도 필드로 뺀다
      refUrl = text;
      continue;
    }
    attrs.push({ labelKey: `attr.${key}`, value: text });
  }

  const diaries = await prisma.diary.findMany({
    where: {
      items: { some: { itemId } },
      // 타인에게는 공개 일기만 (FR-04-A-03)
      ...(owner ? {} : { visibility: "PUBLIC" as const }),
    },
    select: { id: true, createdAt: true, body: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return {
    id: item.id,
    name: deriveItemName(item),
    nickname: item.nickname ?? undefined,
    categoryKey: `category.${item.category.key}`,
    roomId: item.room.id,
    roomName: item.room.name,
    ownerLevel: await levelOf(item.room.userId),
    visibility: item.visibility,
    saleStatus: item.saleStatus,
    roomPublic: item.room.visibility === "PUBLIC",
    codexId: item.codexItemId ?? undefined,
    // 스토리지 전 플레이스홀더는 없는 것으로 다룬다 (OI-47 잔재)
    photos: item.photos.map((p) => realPhotoUrl(p.url)).filter((u): u is string => !!u),
    attrs,
    owner: ownerInfo,
    diaries: diaries.map((d) => ({
      id: d.id,
      date: d.createdAt.toISOString().slice(0, 10),
      excerpt: d.body.slice(0, 80),
    })),
    sale:
      item.saleStatus === "ON_SALE" && item.price !== null && item.currency !== null && item.externalUrl
        ? {
            price: Number(item.price),
            currency: item.currency as CurrencyCode,
            url: item.externalUrl,
          }
        : undefined,
    refUrl,
  };
}

/**
 * 조건부 색인 판정 (D-093).
 *
 * **판매중 + 아이템 공개 + 방 공개**일 때만 색인한다. 판매 의사가 없는
 * 소장품이 색인되면 D-031 절도 리스크를 아이템 단위로 다시 키운다.
 * 떠난 아이템(SOLD)도 제외한다 — 현재 보유자가 아니다 (D-023).
 */
export function isItemIndexable(item: {
  saleStatus: string;
  visibility: string;
  roomPublic: boolean;
}): boolean {
  return (
    item.saleStatus === "ON_SALE" &&
    item.visibility === "PUBLIC" &&
    item.roomPublic
  );
}

/** 사이트맵용 — 색인 대상 아이템 id (D-093, FR-02-A-01) */
export async function indexableItemIds(): Promise<string[]> {
  const rows = await prisma.item.findMany({
    where: {
      saleStatus: "ON_SALE",
      visibility: "PUBLIC",
      room: { visibility: "PUBLIC", user: { deletedAt: null } },
    },
    select: { id: true },
    orderBy: { onSaleAt: { sort: "desc", nulls: "last" } },
    take: 5000,
  });
  return rows.map((r) => r.id);
}
