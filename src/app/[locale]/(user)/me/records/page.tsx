import { getTranslations } from "next-intl/server";
import { DiaryList } from "@/components/domain/diary-list";
import { EmptyState } from "@/components/domain/empty-state";
import { RoomProfile } from "@/components/domain/room-profile";
import { RoomTabs } from "@/components/domain/room-tabs";
import { Link, redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { getRoomDiaries } from "@/lib/data/diary";
import { getRoom } from "@/lib/data/room";

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
  const access = viewer.roomId
    ? await getRoom(viewer.roomId, viewer)
    : ({ status: "none" } as const);
  if (access.status !== "ok") {
    redirect({ href: "/me/settings", locale });
    return null;
  }
  const room = access.room;

  // 본인이므로 비공개 일기도 나온다 (FR-03-A-03)
  const diaries = await getRoomDiaries(room.id, viewer);
  const itemCount = room.sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div>
      <RoomProfile
        roomName={room.name} bio={room.bio}
        level={room.level} itemCount={itemCount}
        imageUrl={room.imageUrl}
        // 톱니바퀴(프로필 설정)는 본인 방에서만 (D-158)
        owner
      />
      <RoomTabs active="records" />
      {/*
        ⚠️ **아이템 진열과 같은 모양이다** (D-133·D-134). 기록이 없을 때는
        상단 버튼 대신 **유도 화면 하나만** 낸다 — 빈 목록 위에 작은 버튼이
        떠 있는 것보다, 무엇을 하면 되는지 한 곳에서 말하는 편이 낫다.
      */}
      <div className="lg:min-w-0">
        {diaries.length === 0 ? (
          <EmptyState
            title={t("myRoom.emptyRecordsTitle")}
            description={t("myRoom.emptyRecordsDesc")}
            action={
              <Link
                href="/diaries/new"
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                {t("myRoom.addFirstRecord")}
              </Link>
            }
          />
        ) : (
          <>
            <div className="flex justify-end px-4 pt-4 lg:px-0">
              <Link
                href="/diaries/new"
                className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground"
              >
                + {t("myRoom.addRecord")}
              </Link>
            </div>
            <DiaryList diaries={diaries} isOwner />
          </>
        )}
      </div>
    </div>
  );
}
