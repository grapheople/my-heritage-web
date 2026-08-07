import { RoomDisplay } from "@/components/domain/room-display";
import { RoomProfile } from "@/components/domain/room-profile";
import { RoomTabs } from "@/components/domain/room-tabs";
import { findRoom } from "@/lib/dev-fixture";

/**
 * S-02 마이룸 (본인).
 *
 * 진열 메타포가 이 서비스의 차별점이다 — 그리드 리스트로 만들면 인스타의
 * 열등 복제품이 된다. 아이템 1개인 방과 50개인 방이 시각적으로 명확히 달라야
 * 하고, 그 "부피"가 자랑거리가 되어야 한다 (원칙 2).
 *
 * S-03(타인 방)과 **같은 컴포넌트를 쓴다.** 차이는 데이터뿐이다 —
 * 본인 방에서는 **비공개 아이템도 표식과 함께 노출**된다 (D-019, FR-01-B-01).
 *
 * ⚠️ 데이터는 개발용 고정값이다 (`lib/dev-fixture.ts`). 인증(D-021·D-092)이
 * 붙으면 세션의 방을 조회하도록 바꾼다.
 */
const MY_ROOM_ID = "r-jun";

export default async function MyRoomPage() {
  const room = findRoom(MY_ROOM_ID)!;

  // 개수 내림차순 (D-075, FR-01-A-10). 떠난 아이템은 집계 제외 (FR-01-A-07)
  const sections = [...room.sections].sort(
    (a, b) => b.items.length - a.items.length,
  );
  const total = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="lg:grid lg:grid-cols-[210px_1fr] lg:gap-6">
      <RoomProfile
        roomName={room.name}
        bio={room.bio}
        level={room.level}
        itemCount={total}
      />
      <RoomTabs active="items" />
      <RoomDisplay
        sections={sections}
        goneItems={room.gone}
        basePath="/me"
      />
    </div>
  );
}
