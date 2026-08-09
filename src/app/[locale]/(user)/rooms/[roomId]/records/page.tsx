import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { DiaryList } from "@/components/domain/diary-list";
import { EmptyState } from "@/components/domain/empty-state";
import { RoomProfile } from "@/components/domain/room-profile";
import { RoomTabs } from "@/components/domain/room-tabs";
import { getViewer } from "@/lib/auth/viewer";
import { getRoomDiaries } from "@/lib/data/diary";
import { getRoom } from "@/lib/data/room";

/**
 * 마이룸 "기록" 탭 (타인).
 * **공개 일기만** (FR-04-A-03). 방이 비공개면 접근 불가 (FR-03-A-04).
 */
export default async function RoomRecordsPage({
  params,
}: PageProps<"/[locale]/rooms/[roomId]/records">) {
  const { roomId } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  const access = await getRoom(roomId, viewer);

  // 없음·탈퇴·차단은 구분하지 않는다 (FR-05-B-04)
  if (access.status === "none") notFound();
  if (access.status === "private") {
    return <EmptyState title={t("error.privateRoom")} description={t("room.privateDesc")} />;
  }
  const room = access.room;

  // 타인이므로 공개 일기만 (FR-04-A-03)
  const diaries = await getRoomDiaries(room.id, viewer);
  const publicCount = room.sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="lg:grid lg:grid-cols-[210px_1fr] lg:gap-6">
      <RoomProfile
        roomName={room.name} bio={room.bio}
        level={room.level} itemCount={publicCount}
          imageUrl={room.imageUrl}
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
