import { getFollowCounts } from "@/lib/data/follow";
import { RoomDisplay } from "@/components/domain/room-display";
import { RoomProfile } from "@/components/domain/room-profile";
import { RoomTabs } from "@/components/domain/room-tabs";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { getRoom } from "@/lib/data/room";

/**
 * S-02 마이룸 (본인).
 *
 * 진열 메타포가 이 서비스의 차별점이다 — 아이템 1개인 방과 50개인 방이
 * 시각적으로 명확히 달라야 하고, 그 "부피"가 자랑거리가 되어야 한다 (원칙 2).
 *
 * S-03(타인 방)과 **같은 컴포넌트를 쓴다.** 차이는 데이터뿐이다 —
 * 본인 방에서는 **비공개 아이템도 표식과 함께 노출**된다 (D-019, FR-01-B-01).
 *
 * ⚠️ **비로그인이면 로그인 화면으로 보낸다** (FR-05-B-07). 탭 자체는 누를 수
 * 있게 두는 것이 D-069 다 — 회색 처리나 숨김을 쓰지 않는다.
 */
export default async function MyRoomPage({
  params,
}: PageProps<"/[locale]/me">) {
  const { locale } = await params;
  const viewer = await getViewer();
  if (!viewer) {
    // redirect 는 내부에서 throw 한다. return 은 타입 좁히기용이다
    redirect({ href: { pathname: "/login", query: { next: "/me" } }, locale });
    return null;
  }

  const access = viewer.roomId
    ? await getRoom(viewer.roomId, viewer)
    : ({ status: "none" } as const);
  if (access.status !== "ok") {
    // 방 이름 미설정 신규 가입은 설정으로 유도한다 (FR-05-A-05 — 전용 화면 없음)
    redirect({ href: "/me/settings", locale });
    return null;
  }

  const room = access.room;
  // 정렬(D-075)·떠난 아이템 제외(FR-01-A-07)는 조회 계층에서 끝난다
  const sections = room.sections;
  const total = sections.reduce((n, s) => n + s.items.length, 0);

  const followCounts = await getFollowCounts(room.id, viewer);

  return (
    <div>
      <RoomProfile
        roomName={room.name}
        bio={room.bio}
        level={room.level}
        itemCount={total}
        imageUrl={room.imageUrl}
        // 톱니바퀴(프로필 설정)는 본인 방에서만 (D-158)
        owner
        // 팔로워·팔로잉 (D-174). 본인 방이라 팔로우 버튼은 없다
        follow={{ ...followCounts, basePath: `/rooms/${room.id}` }}
      />
      <RoomTabs active="items" />
      <RoomDisplay
          sections={sections}
          goneItems={room.gone}
          archivedCount={room.archivedCount}
          basePath="/me"
          owner
        />
    </div>
  );
}
