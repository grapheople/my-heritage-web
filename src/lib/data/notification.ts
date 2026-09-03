import type { NotificationItem, NotificationKind } from "@/lib/data/types";
import type { Viewer } from "@/lib/auth/viewer";
import { prisma } from "@/lib/prisma";

/**
 * S-22 알림함 (D-087, F-08).
 *
 * ⚠️ **본문을 서버에 저장하지 않는다** (FR-08-A-09). DB 에는 `type` 과 치환값
 * (`params`)만 있고, 문장은 화면에서 3개 언어 i18n 리소스로 만든다. 완성된
 * 문장을 저장하면 **유저가 언어를 바꿔도 옛 언어로 남는다.**
 *
 * ⚠️ 알림별 on/off 설정을 두지 않는다 (FR-08-A-08) — 4종 전부 받아야 하는
 * 것이라 끄면 제재 통지를 놓치고, 그러면 D-066("제재 시 로그인을 막지
 * 않는다")의 근거가 무너진다.
 */

/** 알림 종류별 이동 대상 (FR-08-A-06) */
function hrefFor(type: NotificationKind, targetId: string | null): string | undefined {
  if (!targetId) return undefined;
  switch (type) {
    case "CODEX_MERGED":
      return `/codex/${targetId}`;
    case "NEW_FOLLOWER":
      /*
        ⚠️ `targetId` 는 **수신자의 방 id** 다 (D-178). 팔로워의 방이 아니다 —
        PM 이 "알림을 누르면 내 팔로워 리스트로" 를 요구했고, 그 경로를 만들려면
        내 방 id 가 필요하다. 팔로워 이름은 `params` 에 있다
      */
      return `/rooms/${targetId}/followers`;
    case "WEAR_SHOT_COMMENT":
      // 댓글이 달린 하루기록으로 (D-178)
      return `/wear/${targetId}`;
    case "SANCTION":
      // 제재는 전용 안내 화면으로 (S-21)
      return "/suspended";
    case "REPORT_RESULT":
    case "BRAND_REQUEST_RESULT":
      // 신고·브랜드 요청은 대상 화면이 없다 — 알림 본문이 결과 전부다
      return undefined;
  }
}

function toParams(params: unknown): Record<string, string> {
  if (!params || typeof params !== "object") return {};
  return Object.fromEntries(
    Object.entries(params as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
  );
}

export async function getNotifications(viewer: Viewer): Promise<NotificationItem[]> {
  const rows = await prisma.notification.findMany({
    where: { userId: viewer.userId },
    // 최신순 (FR-08-A-04)
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    params: toParams(n.params),
    href: hrefFor(n.type, n.targetId),
    createdAt: n.createdAt.toISOString().slice(0, 10),
    read: n.readAt !== null,
  }));
}

/**
 * 미읽음 개수 (FR-08-A-03).
 *
 * **유저별 값이라 캐시할 수 없다.** 서버에서 세는 이유는 클라이언트 fetch 로
 * 하면 첫 렌더에 뱃지가 없다가 튀어나오기 때문이다.
 */
export async function unreadCount(viewer: Viewer): Promise<number> {
  return prisma.notification.count({
    where: { userId: viewer.userId, readAt: null },
  });
}
