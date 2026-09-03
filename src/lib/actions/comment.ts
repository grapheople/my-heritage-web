"use server";

import { getViewer } from "@/lib/auth/viewer";
import { fail, revalidate, type ActionResult } from "@/lib/actions/shared";
import { blockedUserIds, visibleItemWhere } from "@/lib/data/scope";
import { COMMENT_MAX } from "@/lib/profile";
import { prisma } from "@/lib/prisma";

/**
 * 하루기록 댓글 작성·삭제 (D-178).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 로그인 필수 | FR-05-B-02 |
 * | 볼 수 없는 하루기록에는 달 수 없다 | D-019·D-083 |
 * | 차단 관계면 달 수 없다 | D-051 |
 * | 삭제는 **작성자 또는 하루기록 소유자** | 내 기록에 달린 글을 정리할 수단이 필요하다 |
 * | 경험치 없음 | D-026 — 경험치는 보상이 아니라 리듬이다 |
 *
 * ## ⚠️ 신고 대상이 아니다 (지금은)
 * S-15 신고 대상은 아이템·일기·방·도감·외부 링크다. **댓글을 추가하려면 신고 사유
 * 축(D-052·D-035)과 어드민 처리 흐름(A-08)을 함께 봐야 한다** — 결정 없이 늘리지 않는다.
 */
export async function createComment(input: {
  wearShotId: string;
  body: string;
}): Promise<ActionResult<{ commentId: string }>> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  const body = input.body.trim();
  if (!body) return fail({ body: "내용을 입력해주세요" });
  if ([...body].length > COMMENT_MAX) {
    return fail({ body: `${COMMENT_MAX}자를 넘을 수 없어요` });
  }

  const blockedIds = await blockedUserIds(viewer);
  // 없는 것과 볼 수 없는 것을 구분하지 않는다 (D-083)
  const shot = await prisma.wearShot.findFirst({
    where: {
      id: input.wearShotId,
      item: viewer.roomId
        ? { OR: [{ roomId: viewer.roomId }, visibleItemWhere(blockedIds)] }
        : visibleItemWhere(blockedIds),
    },
    select: { id: true, item: { select: { room: { select: { userId: true } } } } },
  });
  if (!shot) return fail({}, "하루기록을 찾을 수 없습니다");

  const ownerId = shot.item.room.userId;
  const comment = await prisma.comment.create({
    data: { wearShotId: shot.id, userId: viewer.userId, body },
    select: { id: true },
  });

  /*
    하루기록 소유자에게 알림 (D-178).
    ⚠️ **자기 하루기록에 자기가 달면 알림을 만들지 않는다** — 자기 행동의 알림은 소음이다.
    ⚠️ 알림 생성이 실패해도 댓글은 남는다(try 로 감싸지 않고 순서를 뒤에 둔다) —
    반대로 두면 알림 장애가 댓글 작성을 막는다.
  */
  if (ownerId !== viewer.userId) {
    const me = await prisma.room.findUnique({
      where: { id: viewer.roomId ?? "" },
      select: { name: true },
    });
    await prisma.notification.create({
      data: {
        userId: ownerId,
        type: "WEAR_SHOT_COMMENT",
        // 눌러서 하루기록으로 간다 (FR-08-A-06)
        targetId: shot.id,
        // 완성 문장을 저장하지 않는다 — 치환값만 (FR-08-A-09, D-003)
        params: { room: me?.name ?? "" },
      },
    });
  }

  revalidate("/[locale]/wear/[wearShotId]", "/[locale]/notifications");
  return { ok: true, commentId: comment.id };
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      userId: true,
      wearShot: { select: { item: { select: { roomId: true } } } },
    },
  });
  if (!comment) return fail({}, "댓글을 찾을 수 없습니다");

  // 작성자 또는 하루기록 소유자 (위 표 참조)
  const mine = comment.userId === viewer.userId;
  const owner = viewer.roomId === comment.wearShot.item.roomId;
  if (!mine && !owner) return fail({}, "댓글을 찾을 수 없습니다");

  await prisma.comment.delete({ where: { id: comment.id } });
  revalidate("/[locale]/wear/[wearShotId]");
  return { ok: true };
}
