import type { Viewer } from "@/lib/auth/viewer";
import { blockedUserIds, publicRoomWhere } from "@/lib/data/scope";
import { levelOf } from "@/lib/data/level";
import { prisma } from "@/lib/prisma";

/**
 * 팔로우 조회 (D-174).
 *
 * ## ⚠️ 카운트와 목록이 **조회 유저마다 다르다**
 * 차단 관계는 양방향으로 빠지고(`blockedUserIds`), 비공개 방·탈퇴 유저도
 * 제외된다. **도감 보유자 수와 같은 구조다** (E-07-07, D-051) — 그래서
 * **전역 캐시에 올릴 수 없다.**
 *
 * 자기가 차단한 사람만 자기 화면에서 빠지므로 **차단 사실이 상대에게 드러나지
 * 않는다.** D-051 이 요구하는 것이 그것이다.
 *
 * ## ⚠️ 필터가 아니라 조회 조건이다
 * 다 가져와서 걸러내면 비공개·차단이 응답에 실린 뒤 화면에서만 사라진다 (D-083).
 */
export type FollowRoom = {
  roomId: string;
  roomName: string;
  level: number;
  itemCount: number;
};

/** 팔로워·팔로잉 목록에 쓰는 공통 방 조건 */
function visibleRoom(blockedIds: string[]) {
  return { room: publicRoomWhere(blockedIds) };
}

/**
 * 방 → 유저. **경계에서는 roomId 만 쓴다** (D-174).
 *
 * ⚠️ 유저 id 를 화면·클라이언트로 내보내지 않는다. 팔로우 관계의 주체는 유저지만
 * URL·프롭에 유저 id 가 돌아다닐 이유가 없다 — 방 id 는 이미 공개된 식별자다.
 */
async function ownerOf(roomId: string): Promise<string | null> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { userId: true },
  });
  return room?.userId ?? null;
}

/**
 * 팔로워·팔로잉 **수** (뷰어 기준).
 *
 * ⚠️ 목록 길이와 **같은 조건**으로 센다. 카운트는 전역, 목록은 차단 제외로
 * 두면 "팔로워 5명"인데 4명만 보이는 상태가 된다.
 */
export async function getFollowCounts(
  roomId: string,
  viewer: Viewer | null,
): Promise<{ followers: number; following: number }> {
  const userId = await ownerOf(roomId);
  if (!userId) return { followers: 0, following: 0 };
  const blockedIds = await blockedUserIds(viewer);
  const [followers, following] = await Promise.all([
    prisma.follow.count({
      where: { followingId: userId, follower: visibleRoom(blockedIds) },
    }),
    prisma.follow.count({
      where: { followerId: userId, following: visibleRoom(blockedIds) },
    }),
  ]);
  return { followers, following };
}

async function toRooms(
  users: { id: string; room: { id: string; name: string } | null }[],
): Promise<FollowRoom[]> {
  const withRoom = users.filter(
    (u): u is { id: string; room: { id: string; name: string } } => u.room !== null,
  );
  const counts = await prisma.item.groupBy({
    by: ["roomId"],
    where: {
      roomId: { in: withRoom.map((u) => u.room.id) },
      visibility: "PUBLIC",
      // 떠난 아이템은 세지 않는다 (FR-01-A-07, D-023)
      saleStatus: { not: "SOLD" },
    },
    _count: { _all: true },
  });
  const byRoom = new Map(counts.map((c) => [c.roomId, c._count._all]));
  return Promise.all(
    withRoom.map(async (u) => ({
      roomId: u.room.id,
      roomName: u.room.name,
      level: await levelOf(u.id),
      itemCount: byRoom.get(u.room.id) ?? 0,
    })),
  );
}

/** 이 유저를 팔로우하는 방들 — 최근 팔로우순 */
export async function getFollowers(
  userId: string,
  viewer: Viewer | null,
): Promise<FollowRoom[]> {
  const blockedIds = await blockedUserIds(viewer);
  const rows = await prisma.follow.findMany({
    where: { followingId: userId, follower: visibleRoom(blockedIds) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      follower: { select: { id: true, room: { select: { id: true, name: true } } } },
    },
  });
  return toRooms(rows.map((r) => r.follower));
}

/** 이 유저가 팔로우하는 방들 — 최근 팔로우순 */
export async function getFollowing(
  userId: string,
  viewer: Viewer | null,
): Promise<FollowRoom[]> {
  const blockedIds = await blockedUserIds(viewer);
  const rows = await prisma.follow.findMany({
    where: { followerId: userId, following: visibleRoom(blockedIds) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      following: { select: { id: true, room: { select: { id: true, name: true } } } },
    },
  });
  return toRooms(rows.map((r) => r.following));
}

/**
 * 뷰어가 이 유저를 팔로우하고 있는가 — 버튼 상태.
 *
 * ⚠️ 비로그인이면 `false` 다. 로그인 유도는 호출부가 한다 (FR-05-B-02).
 */
export async function isFollowing(
  viewer: Viewer | null,
  roomId: string,
): Promise<boolean> {
  if (!viewer) return false;
  const userId = await ownerOf(roomId);
  if (!userId) return false;
  const row = await prisma.follow.findUnique({
    where: {
      followerId_followingId: { followerId: viewer.userId, followingId: userId },
    },
    select: { id: true },
  });
  return row !== null;
}
