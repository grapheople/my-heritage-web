"use server";

import { getViewer } from "@/lib/auth/viewer";
import { fail, revalidate, type ActionResult } from "@/lib/actions/shared";
import { blockedUserIds } from "@/lib/data/scope";
import { prisma } from "@/lib/prisma";

/**
 * 팔로우·언팔로우 (D-174).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 로그인 필수 | FR-05-B-02 |
 * | **자기 자신은 팔로우할 수 없다** | 의미가 없고 카운트만 흐린다 |
 * | **차단 관계면 팔로우할 수 없다** | D-051 — 서로 안 보이는 관계다 |
 * | 비공개 방·탈퇴 유저는 대상이 아니다 | D-019, NFR-User |
 * | 중복은 **DB 제약**이 막는다 | `@@unique` — 미리 세는 방식은 동시 요청에 뚫린다 |
 *
 * ## ⚠️ 알림을 보내지 않는다 (지금은)
 * 알림 종류는 4개로 고정돼 있고(D-087) 팔로우 알림은 **별도 결정**이다 —
 * 새 팔로워 알림은 빈도가 높아 알림함의 성격을 바꾼다. 결정 없이 추가하지 않는다.
 */
/**
 * 방 → 팔로우 대상 유저.
 *
 * ⚠️ **경계는 roomId 다** — 유저 id 를 클라이언트로 내보내지 않는다.
 * 비공개 방·탈퇴 유저는 여기서 걸러진다. 버튼에 닿을 수 없더라도 **액션은 직접
 * 호출할 수 있으므로** 서버에서 다시 본다 (D-133 계열).
 */
async function targetUserOf(roomId: string): Promise<string | null> {
  const room = await prisma.room.findFirst({
    where: { id: roomId, visibility: "PUBLIC", user: { deletedAt: null } },
    select: { userId: true },
  });
  return room?.userId ?? null;
}

export async function follow(roomId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  // 없는 것과 비공개를 구분하지 않는다 (D-083)
  const targetUserId = await targetUserOf(roomId);
  if (!targetUserId) return fail({}, "방을 찾을 수 없습니다");

  if (viewer.userId === targetUserId) {
    return fail({}, "자기 자신은 팔로우할 수 없습니다");
  }

  // ⚠️ 양방향이다 — 내가 차단했든 상대가 나를 차단했든 관계를 만들지 않는다
  const blocked = await blockedUserIds(viewer);
  if (blocked.includes(targetUserId)) {
    return fail({}, "방을 찾을 수 없습니다");
  }

  try {
    await prisma.follow.create({
      data: { followerId: viewer.userId, followingId: targetUserId },
    });
  } catch {
    // ⚠️ `@@unique` 위반 = 이미 팔로우 중. **정상 흐름이다** — 두 번 눌렀거나
    // 다른 탭에서 이미 눌렀다. 실패로 돌려주면 화면이 어긋난다
  }

  revalidate("/[locale]/rooms/[roomId]", "/[locale]/me");
  return { ok: true };
}

export async function unfollow(roomId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { userId: true },
  });
  if (!room) return fail({}, "방을 찾을 수 없습니다");

  /*
    ⚠️ **차단 여부를 보지 않는다.** 차단된 뒤에도 끊을 수 있어야 한다 —
    관계를 정리하는 방향은 항상 열려 있어야 막힌 상태가 남지 않는다.
    `deleteMany` 는 없는 행에도 성공한다(멱등) — 이미 끊었어도 화면이 어긋나지 않는다
  */
  await prisma.follow.deleteMany({
    where: { followerId: viewer.userId, followingId: room.userId },
  });

  revalidate("/[locale]/rooms/[roomId]", "/[locale]/me");
  return { ok: true };
}
