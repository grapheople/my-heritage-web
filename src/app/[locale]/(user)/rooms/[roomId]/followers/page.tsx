import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/domain/empty-state";
import { RoomRow } from "@/components/domain/room-row";
import { getViewer } from "@/lib/auth/viewer";
import { getFollowers } from "@/lib/data/follow";
import { prisma } from "@/lib/prisma";

/**
 * S-26 팔로워 목록 (D-174).
 *
 * ## ⚠️ 목록이 **조회 유저마다 다르다**
 * 차단은 양방향으로 빠지고 비공개 방·탈퇴 유저도 제외된다 — 도감 보유자 수와
 * 같은 구조다 (E-07-07, D-051). **전역 캐시에 올릴 수 없다.**
 *
 * ## ⚠️ 방 id 로 들어오지만 조회는 유저 기준이다
 * 팔로우 관계는 사람 사이의 것이다 (D-174). 방 → 유저를 먼저 찾는다.
 *
 * 본인 방도 이 경로를 쓴다 — 목록 내용이 소유자에 따라 달라지지 않으므로
 * `/me` 아래에 같은 화면을 또 만들 이유가 없다.
 */
export default async function FollowersPage({
  params,
}: PageProps<"/[locale]/rooms/[roomId]/followers">) {
  const { roomId } = await params;
  const t = await getTranslations();
  const viewer = await getViewer();

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { name: true, userId: true },
  });
  // 없는 것과 볼 수 없는 것을 구분하지 않는다 (D-083)
  if (!room) notFound();

  const rooms = await getFollowers(room.userId, viewer);

  return (
    <div>
      <header className="border-b px-4 py-4 lg:px-0">
        <h1 className="text-lg font-bold tracking-tight">{t("follow.followersTitle")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{room.name}</p>
      </header>

      {rooms.length === 0 ? (
        <EmptyState title={t("follow.noFollowers")} />
      ) : (
        <div className="py-1 lg:py-2">
          {rooms.map((r) => (
            <RoomRow
              key={r.roomId}
              id={r.roomId}
              name={r.roomName}
              level={r.level}
              itemCount={r.itemCount}
            />
          ))}
        </div>
      )}
    </div>
  );
}
