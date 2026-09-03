import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/domain/empty-state";
import { ItemGrid } from "@/components/domain/item-grid";
import { RoomProfile } from "@/components/domain/room-profile";
import { RoomTabs } from "@/components/domain/room-tabs";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { getFollowCounts } from "@/lib/data/follow";
import { getArchivedItems } from "@/lib/data/room";

/**
 * S-28 추억함 (본인) — D-296.
 *
 * ## ⚠️ 삭제한 물건이 오는 곳이 아니다
 * 여기 있는 것은 **지우지 않기로 한 물건**이다. 진열에서만 내려왔고 사진·
 * 속성·하루기록이 전부 그대로다. 삭제는 되돌릴 수 없고 여기 남지도 않는다.
 *
 * ## ⚠️ 꺼내기는 아이템 상세에 있다
 * 목록에 꺼내기 버튼을 붙이지 않는다. 아이템의 상태를 바꾸는 수단은 전부
 * 상세의 소유자 액션 영역에 모여 있고(D-180), 목록에서도 바꿀 수 있게 하면
 * **같은 동작을 부르는 자리가 둘**이 된다.
 *
 * ## 색인하지 않는다
 * `/me/**` 는 전부 noindex 다 (규칙 10, D-078). 기본값이 noindex 이므로
 * 여기서 켜지 않는 것으로 충분하다.
 */
export default async function MyArchivePage({
  params,
}: PageProps<"/[locale]/me/archive">) {
  const { locale } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  if (!viewer) {
    redirect({
      href: { pathname: "/login", query: { next: "/me/archive" } },
      locale,
    });
    return null;
  }
  if (!viewer.roomId) {
    redirect({ href: "/me/settings", locale });
    return null;
  }

  const archive = await getArchivedItems(viewer.roomId, viewer);
  if (!archive) {
    redirect({ href: "/me/settings", locale });
    return null;
  }
  const { room, items } = archive;
  const itemCount = room.sections.reduce((n, s) => n + s.items.length, 0);
  const followCounts = await getFollowCounts(room.id, viewer);

  return (
    <div>
      <RoomProfile
        roomName={room.name}
        bio={room.bio}
        level={room.level}
        itemCount={itemCount}
        imageUrl={room.imageUrl}
        owner
        follow={{ ...followCounts, basePath: `/rooms/${room.id}` }}
      />
      {/*
        ⚠️ 탭은 **아이템** 을 켠 채로 둔다 (D-296). 추억함은 탭이 아니라
        진열에서 갈라져 나온 화면이라 4번째 탭을 만들지 않았다 — 비어 있을
        때도 자리를 차지하는 탭이 된다
      */}
      <RoomTabs active="items" />
      <div className="lg:min-w-0 lg:py-6">
        <h1 className="px-4 pt-5 text-base font-bold tracking-tight lg:px-0">
          {t("myRoom.archive")}
        </h1>
        {items.length === 0 ? (
          <EmptyState
            title={t("myRoom.archiveEmpty")}
            description={t("myRoom.archiveEmptyDesc")}
          />
        ) : (
          <div className="px-4 py-5 lg:px-0">
            {/* 진열과 같은 3열 그리드. 상한은 걸지 않는다 — 전체를 보는 화면이다 */}
            <ItemGrid items={items} capped={false} />
          </div>
        )}
      </div>
    </div>
  );
}
