import type { Viewer } from "@/lib/auth/viewer";
import { blockedUserIds, visibleItemWhere } from "@/lib/data/scope";
import { deriveItemName, NAME_SELECT } from "@/lib/data/item-name";
import { realPhotoUrl } from "@/lib/data/photo";
import { prisma } from "@/lib/prisma";

/**
 * 하루기록 조회 (D-148).
 *
 * ## ⚠️ 공개 판정을 하루기록에 따로 두지 않는다
 * 하루기록은 **아이템에 종속**되므로 **아이템의 공개 판정을 그대로 물려받는다**
 * (방 AND 아이템, D-019·M-06). 별도 `visibility` 를 두면 "아이템은 비공개인데
 * 하루기록은 공개" 같은 상태가 생기고, 그게 곧 유출 경로다.
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

/** 한 아이템의 하루기록 — 아이템 상세용. 최신순 */
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
 * 타인 방의 하루기록 — **공개 아이템의 것만** (D-083).
 *
 * ⚠️ 비공개 아이템의 하루기록이 실리면 그것이 곧 유출이다. 방 공개 판정도
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

/**
 * **한 도감의 하루기록** — 도감 상세용 (D-162).
 *
 * ## ⚠️ 서버 컴포넌트에서 부르면 안 된다
 * 도감 상세는 **색인 대상**이고(D-078·D-098), 이 목록은 "이 물건을 가진 사람이
 * 실제로 쓰는 사진 + 방 이름 + 날짜"다 — **보유자 목록보다 강한 노출**이다.
 * 서버 렌더 결과에 실리면 크롤러가 읽고, D-031 에서 수용한 절도 리스크가
 * 검색엔진 규모로 커진다. **`/api/codex/[codexId]/wear-shots` 를 경유한다.**
 *
 * ## ⚠️ 판매완료 아이템의 하루기록은 제외한다
 * 이 섹션이 **보유자 목록을 대체**하므로 같은 기준을 쓴다 — 판매완료는
 * **현재 보유자가 아니다** (D-023, FR-07-B-06). `visibleItemWhere` 는 SOLD 를
 * 걸러내지 않으므로 여기서 따로 건다.
 *
 * ## ⚠️ 소유자 예외를 두지 않는다
 * `getItemWearShots` 는 소유자에게 자기 비공개 아이템의 하루기록도 보여준다.
 * 여기서는 **공개된 것만** 낸다 — 도감 상세는 남에게 보여주는 화면이고,
 * 내 비공개 아이템이 남과 같은 목록에 섞이면 무엇이 공개인지 알 수 없다.
 */
export async function getCodexWearShots(
  codexId: string,
  viewer: Viewer | null,
): Promise<WearShotCard[]> {
  const blockedIds = await blockedUserIds(viewer);
  const rows = await prisma.wearShot.findMany({
    where: {
      item: {
        ...visibleItemWhere(blockedIds),
        // 위 주석 참조 — 떠난 아이템은 이 목록에 없다 (D-023)
        saleStatus: { not: "SOLD" },
        /*
          ⚠️ **두 경로가 있다** (D-227, `FR-07-C-07`).
          ① 보통 카테고리 — 아이템이 이 도감에 연결돼 있다
          ② **운동** — 운동은 아이템이 아니므로 아이템이 도감을 가리키지 않는다.
             하루기록은 **그 운동을 담은 루틴**에 달린다

          운동 도감에서 ①만 보면 하루기록이 **항상 0건**이다. `OR` 로 합치면 한
          쿼리로 끝나고, 카테고리를 미리 조회해 분기하는 경로가 생기지 않는다
        */
        OR: [
          { codexItemId: codexId },
          { routineEntries: { some: { exercise: { codexItemId: codexId } } } },
        ],
      },
    },
    orderBy: [{ wornOn: "desc" }, { createdAt: "desc" }],
    take: 60,
    select: shotSelect,
  });
  return rows.map(toCard);
}

/** 내 하루기록 — 방 하루기록 탭용. 비공개 아이템의 것도 보인다 */
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
  } & Parameters<typeof deriveItemName>[0];
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
