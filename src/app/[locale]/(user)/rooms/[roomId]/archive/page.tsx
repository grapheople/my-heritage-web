import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/domain/empty-state";
import { FollowButton } from "@/components/domain/follow-button";
import { ItemGrid } from "@/components/domain/item-grid";
import { RoomProfile } from "@/components/domain/room-profile";
import { RoomTabs } from "@/components/domain/room-tabs";
import { getViewer } from "@/lib/auth/viewer";
import { getFollowCounts, isFollowing } from "@/lib/data/follow";
import { getArchivedItems } from "@/lib/data/room";

/**
 * S-28 추억함 (타인 방) — D-296.
 *
 * ## ⚠️ 추억함은 방의 일부다
 * 남의 추억함도 볼 수 있다 (D-296). 다만 **공개 아이템만** 온다 — 조회
 * 계층이 끝낸다 (D-083). 비공개 아이템이 여기 실리면 그것이 곧 유출이다.
 *
 * ## ⚠️ 편집 수단이 없다
 * 꺼내기·삭제는 소유자의 아이템 상세에만 있다 (D-130 과 같은 기준).
 */
export default async function RoomArchivePage({
  params,
}: PageProps<"/[locale]/rooms/[roomId]/archive">) {
  const { roomId } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  const archive = await getArchivedItems(roomId, viewer);
  // 비공개 방·차단·탈퇴는 조회 계층이 이미 걸렀다. 안내는 방 화면에서 낸다
  if (!archive) notFound();
  const { room, items } = archive;

  const publicCount = room.sections.reduce((n, s) => n + s.items.length, 0);
  const [followCounts, followingNow] = await Promise.all([
    getFollowCounts(room.id, viewer),
    isFollowing(viewer, room.id),
  ]);

  return (
    <div>
      <RoomProfile
        roomName={room.name}
        bio={room.bio}
        level={room.level}
        itemCount={publicCount}
        imageUrl={room.imageUrl}
        follow={{ ...followCounts, basePath: `/rooms/${room.id}` }}
        followButton={
          <FollowButton
            roomId={room.id}
            initialFollowing={followingNow}
            loggedIn={viewer !== null}
          />
        }
      />
      <RoomTabs active="items" basePath={`/rooms/${roomId}`} />
      <div className="lg:min-w-0 lg:py-6">
        <h1 className="px-4 pt-5 text-base font-bold tracking-tight lg:px-0">
          {t("myRoom.archive")}
        </h1>
        {items.length === 0 ? (
          <EmptyState title={t("myRoom.archiveEmpty")} />
        ) : (
          <div className="px-4 py-5 lg:px-0">
            <ItemGrid items={items} capped={false} />
          </div>
        )}
      </div>
    </div>
  );
}
