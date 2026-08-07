import { getTranslations } from "next-intl/server";
import { DiaryList } from "@/components/domain/diary-list";
import { EmptyState } from "@/components/domain/empty-state";
import { RoomProfile } from "@/components/domain/room-profile";
import { RoomTabs } from "@/components/domain/room-tabs";
import { Link, redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { findRoom, roomDiaries } from "@/lib/dev-fixture";

/**
 * 마이룸 "기록" 탭 (본인) — myroom-service §1-4.
 * 작성 시각 역순 (FR-04-A-01). 본인 방이므로 **비공개 일기도 표식과 함께** (FR-04-A-02).
 */
export default async function MyRecordsPage({
  params,
}: PageProps<"/[locale]/me/records">) {
  const { locale } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  if (!viewer) {
    redirect({ href: { pathname: "/login", query: { next: "/me/records" } }, locale });
    return null;
  }
  const room = viewer.roomId ? findRoom(viewer.roomId) : undefined;
  if (!room) {
    redirect({ href: "/me/settings", locale });
    return null;
  }

  const diaries = roomDiaries(room.id, true);
  const itemCount = room.sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="lg:grid lg:grid-cols-[210px_1fr] lg:gap-6">
      <RoomProfile
        roomName={room.name} bio={room.bio}
        level={room.level} itemCount={itemCount}
      />
      <RoomTabs active="records" />
      <div className="lg:min-w-0">
        <div className="flex justify-end px-4 py-3 lg:px-3">
          <Link
            href="/diaries/new"
            className="rounded-lg border px-3 py-1.5 text-sm font-semibold hover:bg-accent"
          >
            {t("diary.newTitle")}
          </Link>
        </div>
        {diaries.length === 0 ? (
          <EmptyState title={t("empty.records")} />
        ) : (
          <DiaryList diaries={diaries} isOwner />
        )}
      </div>
    </div>
  );
}
