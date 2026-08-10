import type { Viewer } from "@/lib/auth/viewer";
import { blockedUserIds, visibleItemWhere } from "@/lib/data/scope";
import { deriveItemName, NAME_SELECT } from "@/lib/data/item-name";
import { realPhotoUrl } from "@/lib/data/photo";
import { prisma } from "@/lib/prisma";

/**
 * 착용샷 조회 (D-148).
 *
 * ## ⚠️ 공개 판정을 착용샷에 따로 두지 않는다
 * 착용샷은 **아이템에 종속**되므로 **아이템의 공개 판정을 그대로 물려받는다**
 * (방 AND 아이템, D-019·M-06). 별도 `visibility` 를 두면 "아이템은 비공개인데
 * 착용샷은 공개" 같은 상태가 생기고, 그게 곧 유출 경로다.
 *
 * ## ⚠️ 필터가 아니라 **조회 조건**이다
 * 다 가져와서 걸러내면 비공개·차단이 응답에 실린 뒤 화면에서만 사라진다 (D-083).
 */
export type WearShotCard = {
  id: string;
  photoUrl?: string;
  note?: string;
  wornOn: string;
  itemId: string;
  itemName: string;
  categoryKey: string;
  roomId: string;
  roomName: string;
};

/** 한 아이템의 착용샷 — 아이템 상세용. 최신순 */
export async function getItemWearShots(
  itemId: string,
  viewer: Viewer | null,
): Promise<WearShotCard[]> {
  const blockedIds = await blockedUserIds(viewer);
  const rows = await prisma.wearShot.findMany({
    where: {
      itemId,
      // 소유자는 자기 것을 항상 본다. 타인은 공개 아이템만
      item: viewer?.roomId
        ? { OR: [{ roomId: viewer.roomId }, visibleItemWhere(blockedIds)] }
        : visibleItemWhere(blockedIds),
    },
    orderBy: { wornOn: "desc" },
    select: shotSelect,
  });
  return rows.map(toCard);
}

/**
 * 타인 방의 착용샷 — **공개 아이템의 것만** (D-083).
 *
 * ⚠️ 비공개 아이템의 착용샷이 실리면 그것이 곧 유출이다. 방 공개 판정도
 * 함께 걸린다 (방 AND 아이템, M-06)
 */
export async function getRoomWearShots(
  roomId: string,
  viewer: Viewer | null,
): Promise<WearShotCard[]> {
  const blockedIds = await blockedUserIds(viewer);
  const rows = await prisma.wearShot.findMany({
    where: { item: { roomId, ...visibleItemWhere(blockedIds) } },
    orderBy: [{ wornOn: "desc" }, { createdAt: "desc" }],
    take: 60,
    select: shotSelect,
  });
  return rows.map(toCard);
}

/** 내 착용샷 — 방 착용샷 탭용. 비공개 아이템의 것도 보인다 */
export async function getMyWearShots(
  viewer: Viewer,
  limit = 60,
): Promise<WearShotCard[]> {
  if (!viewer.roomId) return [];
  const rows = await prisma.wearShot.findMany({
    where: { item: { roomId: viewer.roomId } },
    orderBy: [{ wornOn: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: shotSelect,
  });
  return rows.map(toCard);
}

const shotSelect = {
  id: true,
  photoUrl: true,
  note: true,
  wornOn: true,
  item: {
    select: {
      id: true,
      category: { select: { key: true } },
      room: { select: { id: true, name: true } },
      ...NAME_SELECT,
    },
  },
} as const;

type Row = {
  id: string;
  photoUrl: string;
  note: string | null;
  wornOn: string;
  item: {
    id: string;
    category: { key: string };
    room: { id: string; name: string };
  } & Parameters<typeof deriveItemName>[0] & { nickname: string | null };
};

function toCard(r: Row): WearShotCard {
  return {
    id: r.id,
    photoUrl: realPhotoUrl(r.photoUrl),
    note: r.note ?? undefined,
    wornOn: r.wornOn,
    itemId: r.item.id,
    itemName: deriveItemName(r.item),
    categoryKey: `category.${r.item.category.key}`,
    roomId: r.item.room.id,
    roomName: r.item.room.name,
  };
}
