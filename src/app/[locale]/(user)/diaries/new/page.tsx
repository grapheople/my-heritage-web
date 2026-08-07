import { getTranslations } from "next-intl/server";
import { DiaryForm, type LinkableItem } from "@/components/domain/diary-form";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { findRoom } from "@/lib/dev-fixture";

/**
 * S-06 일기 작성.
 *
 * 일기 저장은 **그날 첫 일기일 때만** 경험치 20 (D-026, FR-01-C-01),
 * 판정은 유저 타임존 기준 (D-056). 수정은 경험치 없음 (FR-01-C-03).
 * — 경험치 부여는 서버 액션에 붙는다 (DB 연동 후).
 */
export default async function NewDiaryPage({
  params,
}: PageProps<"/[locale]/diaries/new">) {
  const { locale } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  if (!viewer) {
    redirect({ href: { pathname: "/login", query: { next: "/diaries/new" } }, locale });
    return null;
  }

  // 본인 소유 아이템만. 비공개도 포함한다 (FR-02-A-04·05)
  const room = viewer.roomId ? findRoom(viewer.roomId) : undefined;
  const items: LinkableItem[] = (room?.sections ?? []).flatMap((s) =>
    s.items.map((i) => ({
      id: i.id,
      name: i.name,
      visibility: i.isPrivate ? ("PRIVATE" as const) : ("PUBLIC" as const),
    })),
  );

  return (
    <div className="px-4 py-5 lg:px-0">
      <h1 className="text-lg font-bold tracking-tight">{t("diary.newTitle")}</h1>
      <div className="mt-5">
        <DiaryForm items={items} />
      </div>
    </div>
  );
}
