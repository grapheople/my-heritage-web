import { getTranslations } from "next-intl/server";
import { getFollowCounts } from "@/lib/data/follow";
import { EmptyState } from "@/components/domain/empty-state";
import { RoomProfile } from "@/components/domain/room-profile";
import { RoomTabs } from "@/components/domain/room-tabs";
import { WearShotGrid } from "@/components/domain/wear-shot-grid";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { getRoom } from "@/lib/data/room";
import { getMyWearShots } from "@/lib/data/wear-shot";

/**
 * 마이룸 "하루기록" 탭 (본인) — S-25, D-148.
 *
 * ⚠️ **아이템 진열과 같은 그리드**를 쓴다 (D-144 §4-1-1). "아이템 리스트와
 * 같은 방식"이라는 요구다.
 *
 * ⚠️ **작성 진입점을 여기 두지 않는다.** 하루기록은 아이템에 종속되므로
 * "어떤 아이템의 오늘"인지 정해져야 한다 — 아이템 상세에서만 남긴다.
 * 그래서 빈 화면은 **아이템으로 유도**한다.
 */
export default async function MyWearShotsPage({
  params,
}: PageProps<"/[locale]/me/wear">) {
  const { locale } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  if (!viewer) {
    redirect({ href: { pathname: "/login", query: { next: "/me/wear" } }, locale });
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

  // 본인이므로 비공개 아이템의 하루기록도 나온다
  const shots = await getMyWearShots(viewer);
  const itemCount = room.sections.reduce((n, s) => n + s.items.length, 0);

  const followCounts = await getFollowCounts(room.id, viewer);

  return (
    <div>
      <RoomProfile
        roomName={room.name} bio={room.bio}
        level={room.level} itemCount={itemCount}
        imageUrl={room.imageUrl}
        // 톱니바퀴(프로필 설정)는 본인 방에서만 (D-158)
        owner
        // 팔로워·팔로잉 (D-174). 본인 방이라 팔로우 버튼은 없다
        follow={{ ...followCounts, basePath: `/rooms/${room.id}` }}
      />
      <RoomTabs active="wear" />
      <div className="lg:min-w-0 lg:py-6">
        {shots.length === 0 ? (
          <EmptyState
            title={t("wear.empty", { shot: t("wear.shotNoun") })}
            description={t("wear.emptyDesc")}
          />
        ) : (
          <div className="px-4 py-6 lg:px-0 lg:py-0">
            <WearShotGrid shots={shots} />
          </div>
        )}
      </div>
    </div>
  );
}
