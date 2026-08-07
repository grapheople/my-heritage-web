import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { DiaryList } from "@/components/domain/diary-list";
import { EmptyState } from "@/components/domain/empty-state";
import { RoomProfile } from "@/components/domain/room-profile";
import { RoomTabs } from "@/components/domain/room-tabs";
import { findRoom, roomDiaries } from "@/lib/dev-fixture";

/**
 * 마이룸 "기록" 탭 (타인).
 * **공개 일기만** (FR-04-A-03). 방이 비공개면 접근 불가 (FR-03-A-04).
 */
export default async function RoomRecordsPage({
  params,
}: PageProps<"/[locale]/rooms/[roomId]/records">) {
  const { roomId } = await params;
  const t = await getTranslations();

  const room = findRoom(roomId);
  if (!room) notFound();
  if (!room.isPublic) {
    return <EmptyState title={t("error.privateRoom")} description={t("room.privateDesc")} />;
  }

  const diaries = roomDiaries(room.id, false);
  const publicCount = room.sections.reduce(
    (n, s) => n + s.items.filter((i) => !i.isPrivate).length, 0,
  );

  return (
    <div className="lg:grid lg:grid-cols-[210px_1fr] lg:gap-6">
      <RoomProfile
        roomName={room.name} bio={room.bio}
        level={room.level} itemCount={publicCount}
      />
      <RoomTabs active="records" basePath={`/rooms/${room.id}`} />
      <div className="lg:min-w-0">
        {diaries.length === 0 ? (
          <EmptyState title={t("empty.records")} />
        ) : (
          <DiaryList diaries={diaries} isOwner={false} />
        )}
      </div>
    </div>
  );
}
