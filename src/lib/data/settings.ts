import type { Viewer } from "@/lib/auth/viewer";
import { prisma } from "@/lib/prisma";

/**
 * 설정류 조회 — S-11 프로필 · S-19 차단 · S-21 제재.
 */

export type ProfileSettings = {
  roomName: string;
  bio?: string;
  /** 방 공개 상태 (D-019) */
  roomPublic: boolean;
  /**
   * 방을 비공개로 바꿀 때 **마켓에서 내려가는 매물 수** (FR-02-A-05·07).
   * 방 상태가 아이템 설정을 무시하므로(M-06) 판매중이던 것도 함께 내려간다 —
   * 그 사실을 **전환 전에** 알려야 한다 (D-071).
   */
  onSaleCount: number;
  language: "ko" | "ja" | "en";
  timezone: string;
};

export async function getProfileSettings(
  viewer: Viewer,
): Promise<ProfileSettings | null> {
  const user = await prisma.user.findUnique({
    where: { id: viewer.userId },
    select: {
      language: true,
      timezone: true,
      room: {
        select: {
          name: true,
          bio: true,
          visibility: true,
          _count: { select: { items: { where: { saleStatus: "ON_SALE" } } } },
        },
      },
    },
  });
  if (!user?.room) return null;

  return {
    roomName: user.room.name,
    bio: user.room.bio ?? undefined,
    roomPublic: user.room.visibility === "PUBLIC",
    onSaleCount: user.room._count.items,
    language: user.language,
    timezone: user.timezone,
  };
}

/**
 * 차단 목록 (S-19, D-051).
 *
 * ⚠️ **내가 차단한 사람만** 보여준다. 나를 차단한 사람은 목록에 없다 —
 * 차단 사실을 상대에게 알리지 않기 때문이다 (FR-05-B-04). 가시성은 양방향으로
 * 끊기지만 **목록은 단방향이다.**
 */
export async function getBlocks(
  viewer: Viewer,
): Promise<{ roomId: string; roomName: string; blockedAt: string }[]> {
  const rows = await prisma.block.findMany({
    where: { blockerId: viewer.userId },
    select: {
      createdAt: true,
      blocked: { select: { room: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.flatMap((b) =>
    b.blocked.room
      ? [
          {
            roomId: b.blocked.room.id,
            roomName: b.blocked.room.name,
            blockedAt: b.createdAt.toISOString().slice(0, 10),
          },
        ]
      : [],
  );
}

export type SanctionState = {
  level: "WARNING" | "SUSPENDED" | "BANNED";
  /**
   * 사유 코드 (D-103). **라벨은 3개 언어 i18n 리소스에 있다** —
   * 유저가 자기 언어로 읽어야 한다. S-21 은 제재를 알리는 유일한 경로다(D-066)
   */
  reasonCode: string;
  /** 보조 설명. `OTHER` 일 때만 사실상 필수다 — **이 값은 번역되지 않는다** */
  detail?: string;
  /** 일시 정지에만 존재. 만료 시 자동 해제 (FR-07-A-09) */
  expiresAt?: string;
};

/**
 * 현재 유효한 제재 (S-21, D-064·D-066).
 *
 * ⚠️ **제재 중에도 로그인은 막지 않는다** (D-066) — 막으면 사유를 알릴 방법이
 * 없어진다. 그래서 이 조회가 성공해야 안내 화면을 낼 수 있다.
 *
 * 해제된 것(`liftedAt`)과 만료된 일시 정지는 제외한다.
 */
export async function getActiveSanction(
  viewer: Viewer,
): Promise<SanctionState | null> {
  const now = new Date();
  const s = await prisma.sanction.findFirst({
    where: {
      userId: viewer.userId,
      liftedAt: null,
      // 만료 없음(경고·영구) 또는 아직 안 지난 것
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { level: true, reasonCode: true, detail: true, expiresAt: true },
    orderBy: { issuedAt: "desc" },
  });
  if (!s) return null;

  return {
    level: s.level,
    reasonCode: s.reasonCode,
    detail: s.detail ?? undefined,
    expiresAt: s.expiresAt?.toISOString().slice(0, 10),
  };
}
