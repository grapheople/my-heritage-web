import { getTranslations } from "next-intl/server";
import { getFollowCounts, isFollowing } from "@/lib/data/follow";
import { FollowButton } from "@/components/domain/follow-button";
import { EmptyState } from "@/components/domain/empty-state";
import { RoomProfile } from "@/components/domain/room-profile";
import { RoomTabs } from "@/components/domain/room-tabs";
import { WearShotGrid } from "@/components/domain/wear-shot-grid";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { getRoom } from "@/lib/data/room";
import { getRoomWearShots } from "@/lib/data/wear-shot";

/**
 * 타인 방 "착용샷" 탭 (S-25, D-148).
 *
 * ⚠️ **공개 아이템의 착용샷만** 보인다 — 조회 계층이 끝낸다 (D-083).
 * 비공개 아이템의 착용샷이 여기 실리면 그것이 곧 유출이다.
 *
 * ⚠️ 작성 버튼이 없다 (D-130 과 같은 기준 — 남의 방에는 편집 수단이 없다).
 */
export default async function RoomWearShotsPage({
  params,
}: PageProps<"/[locale]/rooms/[roomId]/wear">) {
  const { roomId } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  const access = await getRoom(roomId, viewer);
  if (access.status === "none") notFound();
  if (access.status === "private") {
    return (
      <EmptyState
        title={t("error.privateRoom")}
        description={t("room.privateDesc")}
      />
    );
  }
  const room = access.room;
  const shots = await getRoomWearShots(roomId, viewer);
  const itemCount = room.sections.reduce((n, s) => n + s.items.length, 0);

  const [followCounts, followingNow] = await Promise.all([
    getFollowCounts(room.id, viewer),
    isFollowing(viewer, room.id),
  ]);

  return (
    <div>
      <RoomProfile
        roomName={room.name} bio={room.bio}
        level={room.level} itemCount={itemCount}
        imageUrl={room.imageUrl}
        follow={{ ...followCounts, basePath: `/rooms/${room.id}` }}
        // 타인 방에만 팔로우 버튼 (D-174). 비로그인에게도 보여주고 누르면 로그인으로
        followButton={
          <FollowButton
            roomId={room.id}
            initialFollowing={followingNow}
            loggedIn={viewer !== null}
          />
        }
      />
      <RoomTabs active="wear" basePath={`/rooms/${roomId}`} />
      <div className="lg:min-w-0 lg:py-6">
        {shots.length === 0 ? (
          <EmptyState title={t("wear.empty")} />
        ) : (
          <div className="px-4 py-6 lg:px-0 lg:py-0">
            <WearShotGrid shots={shots} />
          </div>
        )}
      </div>
    </div>
  );
}
