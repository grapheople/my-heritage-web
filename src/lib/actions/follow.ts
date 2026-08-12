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
 * ## 새 팔로워 알림을 보낸다 (D-178, OI-87 → B안)
 * ⚠️ **기존 4종과 성격이 다르다** — 나머지는 드물게 오는 처리 결과인데 이건 다른
 * 유저의 행동으로 발생한다. 알림함의 빈도·성격이 바뀐다는 것을 알고 넣는다.
 *
 * ⚠️ **언팔로우 → 재팔로우로 알림을 반복 발생시킬 수 있다** — 지금은 막지 않는다
 * (OI-88). 막으려면 "같은 팔로워의 미읽음 알림이 있으면 생성 안 함" 같은 규칙이
 * 필요하고, 그건 알림 정책 결정이다.
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

  /*
    새 팔로워 알림 (D-178).
    ⚠️ **`targetId` 는 수신자의 방 id** 다 — 눌러서 "내 팔로워 목록"으로 가야 한다.
    ⚠️ 알림 생성을 팔로우보다 뒤에 둔다 — 앞에 두면 알림 장애가 팔로우를 막는다.
    ⚠️ 수신자에게 방이 없으면(이론상) 갈 곳이 없으므로 알림을 만들지 않는다.
  */
  const [me, targetRoom] = await Promise.all([
    prisma.room.findUnique({ where: { id: viewer.roomId ?? "" }, select: { name: true } }),
    prisma.room.findFirst({ where: { userId: targetUserId }, select: { id: true } }),
  ]);
  if (targetRoom) {
    await prisma.notification.create({
      data: {
        userId: targetUserId,
        type: "NEW_FOLLOWER",
        targetId: targetRoom.id,
        // 완성 문장을 저장하지 않는다 (FR-08-A-09, D-003)
        params: { room: me?.name ?? "" },
      },
    });
  }

  revalidate("/[locale]/rooms/[roomId]", "/[locale]/me", "/[locale]/notifications");
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
