import type { DiaryEntry } from "@/lib/data/types";
import type { Viewer } from "@/lib/auth/viewer";
import { blockedUserIds } from "@/lib/data/scope";
import { deriveItemName, NAME_SELECT } from "@/lib/data/item-name";
import { realPhotoUrl } from "@/lib/data/photo";
import { prisma } from "@/lib/prisma";

/**
 * 일기 (S-06 작성 · S-07 상세 · 기록 목록).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 작성 시각 역순 | FR-04-A-01 |
 * | 타인에게는 **공개 일기만** | FR-04-A-03 |
 * | 아이템과 N:M | D-054, M-03 |
 *
 * ⚠️ **D-083 의 유일한 예외가 여기 있다** (FR-02-A-08): 아이템이 비공개여도
 * **연결된 공개 일기는 계속 노출된다.** 그 일기에서 아이템으로 가는 **링크만**
 * 렌더하지 않는다. 일기를 지우면 "무엇을 썼는지"까지 사라지기 때문이다.
 */
const DIARY_SELECT = {
  id: true,
  createdAt: true,
  visibility: true,
  body: true,
  room: { select: { id: true, name: true } },
  photos: { select: { url: true }, orderBy: { displayOrder: "asc" as const } },
  items: {
    select: {
      item: { select: { id: true, visibility: true, ...NAME_SELECT } },
    },
  },
} as const;

type DiaryRow = {
  id: string;
  createdAt: Date;
  visibility: "PUBLIC" | "PRIVATE";
  body: string;
  room: { id: string; name: string };
  photos: { url: string }[];
  items: {
    item: {
      id: string;
      visibility: "PUBLIC" | "PRIVATE";
      model: string | null;
      brand: { name: string } | null;
      codexItem: { displayName: string } | null;
    };
  }[];
};

function toEntry(d: DiaryRow): DiaryEntry {
  return {
    id: d.id,
    roomId: d.room.id,
    roomName: d.room.name,
    createdAt: d.createdAt.toISOString().slice(0, 10),
    visibility: d.visibility,
    body: d.body,
    photos: d.photos.map((p) => realPhotoUrl(p.url)).filter((u): u is string => !!u),
    items: d.items.map(({ item }) => ({
      id: item.id,
      name: deriveItemName(item),
      // 비공개 아이템이면 화면이 링크를 비활성화한다 (FR-02-A-08).
      // 일기 자체는 그대로 노출된다 — D-083 의 유일한 예외
      visibility: item.visibility,
    })),
  };
}

export async function getRoomDiaries(
  roomId: string,
  viewer: Viewer | null,
): Promise<DiaryEntry[]> {
  const owner = viewer?.roomId === roomId;
  const rows = await prisma.diary.findMany({
    where: {
      roomId,
      ...(owner ? {} : { visibility: "PUBLIC" as const }),
    },
    select: DIARY_SELECT,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map(toEntry);
}

export async function getDiary(
  diaryId: string,
  viewer: Viewer | null,
): Promise<DiaryEntry | null> {
  const d = await prisma.diary.findUnique({
    where: { id: diaryId },
    select: {
      ...DIARY_SELECT,
      room: {
        select: {
          id: true,
          name: true,
          visibility: true,
          userId: true,
          user: { select: { deletedAt: true } },
        },
      },
    },
  });
  if (!d || d.room.user.deletedAt) return null;

  const owner = viewer?.roomId === d.room.id;
  if (!owner) {
    const blockedIds = await blockedUserIds(viewer);
    if (blockedIds.includes(d.room.userId)) return null;
    // 방 AND 일기 둘 다 공개여야 한다 (D-019, M-06)
    if (d.room.visibility !== "PUBLIC" || d.visibility !== "PUBLIC") return null;
  }
  return toEntry(d);
}

/**
 * 일기 작성 폼에서 고를 수 있는 아이템 — **본인 것만. 비공개도 포함**한다
 * (FR-02-A-04·05, D-054).
 *
 * ⚠️ **떠난 아이템(판매완료)도 포함한다.** 방에는 남아 있고(D-023), "떠나
 * 보냈다"는 기록이야말로 원칙 1이 말하는 것이다. 다만 **스펙이 명시하지 않은
 * 지점이라 OI-55 로 올려두었다** — 피드에서 떠난 아이템을 빼는 것과 한 쌍이다.
 */
export async function ownItemsForDiary(
  viewer: Viewer,
): Promise<{ id: string; name: string; visibility: "PUBLIC" | "PRIVATE" }[]> {
  if (!viewer.roomId) return [];
  const items = await prisma.item.findMany({
    where: { roomId: viewer.roomId },
    select: { id: true, visibility: true, ...NAME_SELECT },
    orderBy: { createdAt: "desc" },
  });
  return items.map((i) => ({
    id: i.id,
    name: deriveItemName(i),
    visibility: i.visibility,
  }));
}

/** 일기 본문 최대 길이. 언어 무관 유니코드 문자 수 (D-053, FR-01-A-01·02) */
export const DIARY_MAX_LENGTH = 1000;
/** 사진 최대 장수 (D-037, FR-01-A-05) */
export const DIARY_MAX_PHOTOS = 10;
