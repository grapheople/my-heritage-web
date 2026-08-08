import type { Viewer } from "@/lib/auth/viewer";
import { prisma } from "@/lib/prisma";

/**
 * 조회 범위 — **"이 뷰어에게 무엇이 보이는가"를 한 곳에서 정한다.**
 *
 * ⚠️ 화면마다 필터를 다시 쓰면 D-019·D-051·D-083 이 한 화면씩 새기 시작한다.
 * D-096 이 이미 그렇게 새서 나온 결정이다 (도감 상세는 가렸는데 검색 결과는
 * 안 가림). 조회 조건은 여기서만 만든다.
 */

/**
 * 차단 관계인 유저 id 집합 (D-051, M-11).
 *
 * ⚠️ **차단은 단방향 1건이 양쪽 가시성을 끊는다.** A가 B를 차단하면 B도 A를
 * 볼 수 없다. 그래서 `blockerId = 나` 와 `blockedId = 나` 를 **둘 다** 모은다.
 * 한쪽만 보면 "차단한 사람은 안 보이는데 차단당한 사람은 보이는" 상태가 된다.
 */
export async function blockedUserIds(viewer: Viewer | null): Promise<string[]> {
  if (!viewer) return [];
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: viewer.userId }, { blockedId: viewer.userId }] },
    select: { blockerId: true, blockedId: true },
  });
  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.blockerId === viewer.userId ? r.blockedId : r.blockerId);
  }
  return [...ids];
}

/**
 * 공개 방의 조건 (D-019, M-06).
 *
 * **방 상태가 아이템 설정을 무시한다** — 방이 비공개면 안의 아이템이 공개여도
 * 타인에게 보이지 않는다. 탈퇴 유저의 방도 제외한다 (E-07-03).
 */
export function publicRoomWhere(blockedIds: string[]) {
  return {
    visibility: "PUBLIC" as const,
    user: {
      deletedAt: null,
      ...(blockedIds.length > 0 ? { id: { notIn: blockedIds } } : {}),
    },
  };
}

/**
 * 타인에게 보이는 아이템의 조건 (D-019, D-083).
 *
 * ⚠️ **여기서 거른다 — 화면에서 숨기지 않는다.** 권한 없는 아이템을 응답에
 * 실어 보내고 클라이언트에서 감추면, 흐리게 처리한 것과 같아진다. D-019 두 축
 * 프라이버시의 취지는 **존재 자체를 감추는 것**이다 (FR-01-B-06·07).
 */
export function visibleItemWhere(blockedIds: string[]) {
  return {
    visibility: "PUBLIC" as const,
    room: publicRoomWhere(blockedIds),
  };
}

/** 본인 방인가 — 비공개 아이템·비공개 일기 노출 판정의 기준 */
export function isOwner(viewer: Viewer | null, roomId: string): boolean {
  return viewer?.roomId === roomId;
}
