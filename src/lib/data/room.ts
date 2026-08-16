import type { ItemThumbData } from "@/components/domain/item-thumb";
import type { RoomSection } from "@/components/domain/room-display";
import type { Viewer } from "@/lib/auth/viewer";
import { blockedUserIds, isOwner } from "@/lib/data/scope";
import { deriveItemName, NAME_SELECT } from "@/lib/data/item-name";
import { realPhotoUrl } from "@/lib/data/photo";
import { levelOf } from "@/lib/data/level";
import { prisma } from "@/lib/prisma";
import { DISPLAYABLE_ITEM } from "@/lib/item-display";
import { MUSCLE_SELECT, musclesOf, musclesOfRoutine } from "@/lib/data/muscles";

/**
 * 방 조회 — S-02(본인) · S-03(타인) 공용.
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 카테고리 섹션은 **개수 내림차순** | D-075, FR-01-A-10 |
 * | 판매완료(떠난 아이템)는 섹션·집계에서 제외하고 별도 섹션 | D-023, FR-01-A-07 |
 * | 본인 방에서는 비공개 아이템도 **표식과 함께** 노출 | D-019, FR-01-B-01 |
 * | 타인 방에서는 비공개 아이템을 **응답에서 제외** | D-083, FR-01-B-06·07 |
 * | 방이 비공개면 타인에게 방 자체가 안 보인다 | D-019, M-06 |
 */
export type RoomView = {
  id: string;
  name: string;
  /** 방 대표 사진 (D-130). 없으면 헤더가 빈 자리를 그린다 */
  imageUrl?: string;
  bio?: string;
  level: number;
  /** 소유자 설정 언어 — NEW 피드 언어권 필터의 기준 (D-027) */
  lang: "ko" | "ja" | "en";
  isPublic: boolean;
  sections: RoomSection[];
  gone: ItemThumbData[];
};

/**
 * 방 접근 결과.
 *
 * ⚠️ **`private` 과 `none` 을 구분하는 이유**: FR-01-B-05 는 비공개 방에
 * 접근 불가 **안내**를 요구한다. 반면 **차단은 `none` 으로 낸다** — 차단
 * 사실을 상대에게 알리지 않기 때문이다 (FR-05-B-04). 탈퇴·부재도 `none`.
 */
export type RoomAccess =
  | { status: "ok"; room: RoomView }
  | { status: "private" }
  | { status: "none" };

export async function getRoom(
  roomId: string,
  viewer: Viewer | null,
): Promise<RoomAccess> {
  const owner = isOwner(viewer, roomId);
  const blockedIds = await blockedUserIds(viewer);

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      name: true,
      bio: true,
      imageUrl: true,
      visibility: true,
      user: { select: { id: true, language: true, deletedAt: true } },
    },
  });
  if (!room) return { status: "none" };

  // 탈퇴 유저의 방은 없는 것으로 취급한다 (NFR-User — 방·아이템·일기는 삭제)
  if (room.user.deletedAt) return { status: "none" };
  // 차단은 **존재 자체를 숨긴다.** 비공개 안내를 내면 차단 사실이 드러난다
  if (!owner && blockedIds.includes(room.user.id)) return { status: "none" };
  // 방이 비공개면 소유자만. 안내는 낸다 (D-019, M-06, FR-01-B-05)
  if (!owner && room.visibility !== "PUBLIC") return { status: "private" };

  const items = await prisma.item.findMany({
    where: {
      // ⚠️ **전시 단위 판정은 한 곳에서 온다** (D-211·D-221) — 조건을 여기 적지 않는다
      ...DISPLAYABLE_ITEM,
      roomId,
      // ⚠️ 타인에게는 비공개 아이템을 **응답에서 뺀다.** 화면에서 숨기는 것이
      // 아니다 — 흐리게 두면 "비공개가 몇 개 있다"가 새어나간다 (D-083)
      ...(owner ? {} : { visibility: "PUBLIC" as const }),
    },
    select: {
      id: true,
      visibility: true,
      saleStatus: true,
      createdAt: true,
      category: { select: { key: true, displayOrder: true } },
      photos: {
        select: { url: true },
        orderBy: { displayOrder: "asc" },
        take: 1, // 첫 장이 대표 이미지 (D-037, FR-07-A-04)
      },
      /*
        ⚠️ 사진이 없을 수 있다 (D-224 — 운동은 `requiresPhoto: false`). 그때
        대표 이미지는 **근육맵**이므로 자극부위를 함께 읽는다 (`FR-07-A-14`)
      */
      ...MUSCLE_SELECT,
      /** 루틴이면 구성 종목의 합집합이 자극부위다 (`FR-10-D-01`) */
      routineItems: {
        select: { exercise: { select: MUSCLE_SELECT } },
        orderBy: { displayOrder: "asc" },
      },
      ...NAME_SELECT,
    },
    orderBy: { createdAt: "desc" },
  });

  const thumb = (i: (typeof items)[number]): ItemThumbData => ({
    id: i.id,
    name: deriveItemName(i),
    nickname: i.nickname ?? undefined,
    // 스토리지 전이라 플레이스홀더는 없는 것으로 다룬다 (OI-47)
    photoUrl: realPhotoUrl(i.photos[0]?.url),
    /*
      ⚠️ 루틴이면 **구성 종목의 합집합**, 종목이면 **자기 값**이다 (D-221 §7).
      사진이 있으면 카드가 사진을 쓰므로 이 값은 쓰이지 않는다 — 우선순위는
      `ItemThumb` 가 정한다 (`FR-10-D-04`)
    */
    muscles:
      i.routineItems.length > 0
        ? musclesOfRoutine(i.routineItems.map((r) => r.exercise))
        : musclesOf(i),
    categoryKey: i.category.key,
    onSale: i.saleStatus === "ON_SALE",
    // 비공개 표식은 본인 방에서만 뜬다 — 타인 뷰에는 애초에 없다
    isPrivate: i.visibility === "PRIVATE",
  });

  // 떠난 아이템은 카테고리 진열·개수 집계 어디에도 들어가지 않는다 (D-023)
  const gone = items.filter((i) => i.saleStatus === "SOLD").map(thumb);
  const living = items.filter((i) => i.saleStatus !== "SOLD");

  const byCategory = new Map<string, { order: number; items: ItemThumbData[] }>();
  for (const i of living) {
    const key = i.category.key;
    const bucket = byCategory.get(key) ?? {
      order: i.category.displayOrder,
      items: [],
    };
    bucket.items.push(thumb(i));
    byCategory.set(key, bucket);
  }

  const sections: RoomSection[] = [...byCategory.entries()]
    .map(([slug, b]) => ({
      categoryKey: `category.${slug}`,
      slug,
      items: b.items,
      order: b.order,
    }))
    // **개수 내림차순이 규칙이다** (D-075). 동수일 때만 카테고리 고정 순서로
    // 갈라 렌더가 조회마다 흔들리지 않게 한다
    .sort((a, b) => b.items.length - a.items.length || a.order - b.order)
    .map(({ categoryKey, slug, items }) => ({ categoryKey, slug, items }));

  return {
    status: "ok",
    room: {
      id: room.id,
      name: room.name,
      bio: room.bio ?? undefined,
      imageUrl: room.imageUrl ?? undefined,
      level: await levelOf(room.user.id),
      lang: room.user.language,
      isPublic: room.visibility === "PUBLIC",
      sections,
      gone,
    },
  };
}

/**
 * 카테고리 전체 (S-23) — 방의 한 카테고리만.
 *
 * 진열은 섹션당 상한이 있어서(D-085) 전체를 보려면 이 경로가 필요하다.
 */
export async function getRoomCategory(
  roomId: string,
  slug: string,
  viewer: Viewer | null,
): Promise<{ room: RoomView; section: RoomSection } | null> {
  const access = await getRoom(roomId, viewer);
  // 카테고리 화면에는 비공개 안내를 따로 두지 않는다 — 방으로 보낸다
  if (access.status !== "ok") return null;
  const section = access.room.sections.find((s) => s.slug === slug);
  if (!section) return null;
  return { room: access.room, section };
}
