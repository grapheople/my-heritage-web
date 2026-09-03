import type { ItemThumbData } from "@/components/domain/item-thumb";
import type { RoomSection } from "@/components/domain/room-display";
import type { Viewer } from "@/lib/auth/viewer";
import { blockedUserIds, isOwner } from "@/lib/data/scope";
import { deriveItemName, NAME_SELECT } from "@/lib/data/item-name";
import { realPhotoUrl } from "@/lib/data/photo";
import { levelOf } from "@/lib/data/level";
import { prisma } from "@/lib/prisma";
import { DISPLAYABLE_ITEM } from "@/lib/item-display";
import {
  muscleOrder,
  musclesOfRoutine,
  ROUTINE_MUSCLE_SELECT,
} from "@/lib/data/muscles";

/**
 * 방 조회 — S-02(본인) · S-03(타인) 공용.
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 카테고리 섹션은 **개수 내림차순** | D-075, FR-01-A-10 |
 * | 판매완료(떠난 아이템)는 섹션·집계에서 제외하고 별도 섹션 | D-023, FR-01-A-07 |
 * | 보관된 아이템(추억함)은 **진열에서 빠진다** — 판정은 `DISPLAYABLE_ITEM` | D-296 |
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
  /**
   * 추억함에 보관된 아이템 수 (D-296) — 진열 맨 아래 진입 링크에 쓴다.
   *
   * ⚠️ **뷰어 기준으로 센다.** 타인에게는 공개 아이템만 세야 한다 —
   * 전체 개수를 내면 "비공개가 몇 개 있다"가 새어나간다 (D-083).
   */
  archivedCount: number;
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
        대표 이미지는 **근육맵**이고, 그 값은 담긴 운동의 마스터에서 온다
        (`FR-07-A-14` · `FR-10-D-01`). D-227 이후 **아이템 속성값을 읽지 않는다**
      */
      ...ROUTINE_MUSCLE_SELECT,
      ...NAME_SELECT,
    },
    orderBy: { createdAt: "desc" },
  });

  /*
    자극부위 표시 순서 (`FR-10-D-03`) — **화면당 한 번.** 카드마다 읽으면 진열
    한 화면에 쿼리가 수십 개 붙는다
  */
  const muscleOrderMap = await muscleOrder();

  const thumb = (i: (typeof items)[number]): ItemThumbData => ({
    id: i.id,
    name: deriveItemName(i),
    // 스토리지 전이라 플레이스홀더는 없는 것으로 다룬다 (OI-47)
    photoUrl: realPhotoUrl(i.photos[0]?.url),
    /*
      ⚠️ 루틴이면 **담긴 운동의 합집합**이다 (D-227). 운동 카테고리 밖의
      아이템은 담긴 것이 없으므로 빈 배열이 된다 — 그 카드는 사진을 쓴다.
      사진이 있으면 카드가 사진을 우선하므로 이 값은 쓰이지 않는다 (`FR-10-D-04`)
    */
    muscles: musclesOfRoutine(i.routineEntries, muscleOrderMap),
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

  /*
    추억함 개수 (D-296) — 진열 맨 아래 진입 링크용. **뷰어 기준**이라
    타인에게는 공개 아이템만 센다 (D-083). 부품은 전시 단위가 아니므로
    `parentId: null` 을 그대로 건다 — 진열과 같은 기준이어야 개수가 맞는다
  */
  const archivedCount = await prisma.item.count({
    where: {
      roomId,
      parentId: null,
      archivedAt: { not: null },
      ...(owner ? {} : { visibility: "PUBLIC" as const }),
    },
  });

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
      archivedCount,
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

/**
 * 추억함 목록 (S-28, D-296) — 방 하나의 **보관된** 아이템.
 *
 * ## ⚠️ 진열과 정반대 조건 하나만 다르다
 * `DISPLAYABLE_ITEM` 을 쓸 수 없다 — 그 상수는 `archivedAt: null` 을 걸기
 * 때문이다. 나머지 조건(`parentId: null`, 뷰어별 공개 판정)은 **진열과 같게**
 * 유지한다. 여기서만 기준이 갈리면 진열에서 사라진 것이 추억함에도 없는
 * 상태가 생긴다.
 *
 * ## ⚠️ 타인에게도 보인다
 * 추억함은 방의 일부다 (D-296). 비공개 아이템은 **응답에서 뺀다** — 화면에서
 * 숨기지 않는다 (D-083).
 *
 * 정렬은 **보관한 순서 역순**이다. 진열의 `createdAt` 역순과 다르다 —
 * 추억함에서 알고 싶은 것은 "언제 등록했나"가 아니라 "언제 넣었나"다.
 */
export async function getArchivedItems(
  roomId: string,
  viewer: Viewer | null,
): Promise<{ room: RoomView; items: ItemThumbData[] } | null> {
  const access = await getRoom(roomId, viewer);
  // 비공개 방·차단·탈퇴는 방 조회가 이미 걸렀다. 안내는 방에서 낸다
  if (access.status !== "ok") return null;

  const owner = isOwner(viewer, roomId);
  const rows = await prisma.item.findMany({
    where: {
      roomId,
      parentId: null,
      archivedAt: { not: null },
      ...(owner ? {} : { visibility: "PUBLIC" as const }),
    },
    select: {
      id: true,
      visibility: true,
      saleStatus: true,
      category: { select: { key: true } },
      photos: { select: { url: true }, orderBy: { displayOrder: "asc" }, take: 1 },
      ...ROUTINE_MUSCLE_SELECT,
      ...NAME_SELECT,
    },
    orderBy: { archivedAt: "desc" },
  });

  const muscleOrderMap = await muscleOrder();
  const items: ItemThumbData[] = rows.map((i) => ({
    id: i.id,
    name: deriveItemName(i),
    photoUrl: realPhotoUrl(i.photos[0]?.url),
    muscles: musclesOfRoutine(i.routineEntries, muscleOrderMap),
    categoryKey: i.category.key,
    /*
      ⚠️ 보관된 아이템은 마켓에 없다 — `saleStatus` 가 `ON_SALE` 이어도
      조회에서 빠진다 (D-296). 판매중 배지를 그대로 내면 누를 수 없는
      상태를 광고하는 셈이라 **끈다**
    */
    onSale: false,
    isPrivate: i.visibility === "PRIVATE",
  }));

  return { room: access.room, items };
}
