import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getFollowCounts, isFollowing } from "@/lib/data/follow";
import { FollowButton } from "@/components/domain/follow-button";
import { EmptyState } from "@/components/domain/empty-state";
import { RoomDisplay } from "@/components/domain/room-display";
import { RoomProfile } from "@/components/domain/room-profile";
import { RoomTabs } from "@/components/domain/room-tabs";
import { getViewer } from "@/lib/auth/viewer";
import { getRoom } from "@/lib/data/room";

/**
 * S-03 마이룸 (타인).
 *
 * S-02와 같은 컴포넌트를 쓰고 **뷰어 분기는 데이터를 거르는 것으로** 처리한다.
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 공개 아이템·공개 일기만 | D-019, FR-01-B-02 |
 * | 권한 없는 아이템은 **응답에서 제외**. 흐리게·자물쇠 금지 | D-083, FR-01-B-06·07 |
 * | 구매처·구매일·구매가 비노출 (소유 기간만) | FR-01-B-03 |
 * | 아이템 수는 **공개 아이템만** 집계 | FR-01-C-03 |
 * | 비공개 방이면 접근 불가 안내 | D-019, FR-01-B-05 |
 */
export default async function OtherRoomPage({
  params,
}: PageProps<"/[locale]/rooms/[roomId]">) {
  const { roomId } = await params;
  const t = await getTranslations();

  const access = await getRoom(roomId, await getViewer());

  // 없음·탈퇴·차단은 구분하지 않는다 — 차단 사실이 드러나면 안 된다 (FR-05-B-04)
  if (access.status === "none") notFound();

  // 비공개 방은 안내만 낸다 (FR-01-B-05)
  if (access.status === "private") {
    return (
      <EmptyState
        title={t("error.privateRoom")}
        description={t("room.privateDesc")}
      />
    );
  }

  // ⚠️ 비공개 아이템은 **조회에서** 빠져 있다 (D-083). 화면에서 거르지 않는다
  const room = access.room;
  const sections = room.sections;
  const publicCount = sections.reduce((n, s) => n + s.items.length, 0);

  const viewer = await getViewer();
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
        // 타인 방에만 팔로우 버튼 (D-174). 비로그인에게도 보여주고 누르면 로그인으로
        followButton={
          <FollowButton
            roomId={room.id}
            initialFollowing={followingNow}
            loggedIn={viewer !== null}
          />
        }
      />
      <RoomTabs active="items" basePath={`/rooms/${room.id}`} />
      {publicCount === 0 ? (
        <div className="lg:min-w-0">
          <EmptyState title={t("empty.items")} />
        </div>
      ) : (
        <RoomDisplay
          sections={sections}
          goneItems={room.gone}
          basePath={`/rooms/${room.id}`}
        />
      )}
    </div>
  );
}
