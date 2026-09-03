import type { Viewer } from "@/lib/auth/viewer";
import { blockedUserIds, visibleItemWhere } from "@/lib/data/scope";
import { realPhotoUrl } from "@/lib/data/photo";
import { WORKOUT_CATEGORY } from "@/lib/categories";
import { deriveItemName, NAME_SELECT } from "@/lib/data/item-name";
import { prisma } from "@/lib/prisma";

/**
 * 하루기록 상세 + 댓글 (D-178).
 *
 * ## ⚠️ 공개 판정을 새로 만들지 않는다
 * 하루기록은 **아이템의 공개 판정을 물려받고**(D-148), 댓글은 그 하루기록을 물려받는다.
 * 여기서 하는 일은 그 사슬을 조회 조건으로 옮기는 것뿐이다 (D-083 — 필터가 아니라
 * 조회 조건).
 *
 * ## ⚠️ 색인하지 않는다
 * 하루기록 상세는 **사진 + 방 이름 + 날짜**다. 방 상세(S-02·S-03)가 `noindex` 인데
 * 이걸 색인하면 "누가 무엇을 쓰는지"가 검색에 열린다 (D-078·D-031). 이 저장소는
 * **기본값이 noindex** 이므로 화면에서 켜지 않는 것으로 충분하다.
 */
export type CommentItem = {
  id: string;
  body: string;
  createdAt: string;
  roomId: string;
  roomName: string;
  /** 뷰어가 지울 수 있는가 — 작성자 또는 하루기록 소유자 */
  canDelete: boolean;
  /** 뷰어가 쓴 댓글인가 — 내 댓글은 신고 대상이 아니다 (D-179) */
  mine: boolean;
};

export type WearShotDetail = {
  id: string;
  photoUrl?: string;
  note?: string;
  wornOn: string;
  itemId: string;
  itemName: string;
  /**
   * 이 샷이 붙은 아이템이 **루틴인가** (D-244).
   *
   * ⚠️ 화면이 `하루기록`/`하루기록` 을 고르는 데 쓴다. 조회에서 내지 않으면 샷 상세만
   * 옛 명칭으로 남는데 **화면은 멀쩡하고 말만 갈린다**.
   */
  isRoutine: boolean;
  roomId: string;
  roomName: string;
  /** 뷰어가 이 하루기록의 소유자인가 */
  owner: boolean;
  comments: CommentItem[];
};

export async function getWearShotDetail(
  wearShotId: string,
  viewer: Viewer | null,
): Promise<WearShotDetail | null> {
  const blockedIds = await blockedUserIds(viewer);
  const shot = await prisma.wearShot.findFirst({
    where: {
      id: wearShotId,
      // 소유자는 자기 것을 항상 본다. 타인은 공개 아이템만 (D-148 과 같은 기준)
      item: viewer?.roomId
        ? { OR: [{ roomId: viewer.roomId }, visibleItemWhere(blockedIds)] }
        : visibleItemWhere(blockedIds),
    },
    select: {
      id: true,
      photoUrl: true,
      note: true,
      wornOn: true,
      item: {
        select: {
          id: true,
          roomId: true,
          room: { select: { name: true } },
          category: { select: { key: true } },
          ...NAME_SELECT,
        },
      },
      comments: {
        // ⚠️ 차단 관계인 사람의 댓글은 **조회에서** 빠진다 (D-051·D-083)
        where:
          blockedIds.length > 0 ? { userId: { notIn: blockedIds } } : undefined,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          createdAt: true,
          userId: true,
          user: { select: { room: { select: { id: true, name: true } } } },
        },
      },
    },
  });
  if (!shot) return null;

  const owner = viewer?.roomId === shot.item.roomId;
  return {
    id: shot.id,
    photoUrl: realPhotoUrl(shot.photoUrl),
    note: shot.note ?? undefined,
    wornOn: shot.wornOn,
    itemId: shot.item.id,
    itemName: deriveItemName(shot.item),
    isRoutine: shot.item.category.key === WORKOUT_CATEGORY,
    roomId: shot.item.roomId,
    roomName: shot.item.room.name,
    owner,
    comments: shot.comments
      // 방이 없는 유저(탈퇴 등)의 댓글은 낼 자리가 없다
      .filter((c) => c.user.room !== null)
      .map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt.toISOString().slice(0, 10),
        roomId: c.user.room!.id,
        roomName: c.user.room!.name,
        // 작성자 본인 또는 하루기록 소유자가 지운다 — 내 기록에 달린 글을
        // 정리할 수단이 없으면 소유자가 통제권을 잃는다
        canDelete: viewer !== null && (c.userId === viewer.userId || owner),
        mine: viewer !== null && c.userId === viewer.userId,
      })),
  };
}
