import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/domain/empty-state";
import { RoomDisplay } from "@/components/domain/room-display";
import { RoomProfile } from "@/components/domain/room-profile";
import { RoomTabs } from "@/components/domain/room-tabs";
import { findRoom } from "@/lib/dev-fixture";

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

  const room = findRoom(roomId);
  if (!room) notFound();

  // 비공개 방 — 소유자가 아니면 안내만 (FR-01-B-05)
  if (!room.isPublic) {
    return (
      <EmptyState
        title={t("error.privateRoom")}
        description={t("room.privateDesc")}
      />
    );
  }

  // ⚠️ 비공개 아이템을 여기서 걸러 응답에 싣지 않는다 (D-083)
  const sections = room.sections
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.isPrivate) }))
    .filter((s) => s.items.length > 0)
    .sort((a, b) => b.items.length - a.items.length); // 개수 내림차순 (D-075)

  const publicCount = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="lg:grid lg:grid-cols-[210px_1fr] lg:gap-6">
      <RoomProfile
        roomName={room.name}
        bio={room.bio}
        level={room.level}
        itemCount={publicCount}
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
