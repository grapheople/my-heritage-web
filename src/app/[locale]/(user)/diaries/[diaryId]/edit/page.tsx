import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { DiaryForm, type LinkableItem } from "@/components/domain/diary-form";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { getDiary, ownItemsForDiary } from "@/lib/data/diary";

/**
 * S-06 일기 수정.
 *
 * **소유자만 수정·삭제할 수 있다** (FR-01-C-04, D-019).
 * 수정으로 경험치를 주지 않는다 (FR-01-C-03).
 * 작성 후에도 공개 범위를 바꿀 수 있다 (FR-03-A-02).
 */
export default async function EditDiaryPage({
  params,
}: PageProps<"/[locale]/diaries/[diaryId]/edit">) {
  const { locale, diaryId } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  if (!viewer) {
    redirect({ href: "/login", locale });
    return null;
  }

  const diary = await getDiary(diaryId, viewer);
  if (!diary) notFound();
  if (viewer.roomId !== diary.roomId) notFound(); // 소유자만 (FR-01-C-04)

  const items: LinkableItem[] = await ownItemsForDiary(viewer);

  return (
    <div className="px-4 py-5 lg:px-0">
      <h1 className="text-lg font-bold tracking-tight">{t("diary.editTitle")}</h1>
      <div className="mt-5">
        <DiaryForm
          diaryId={diary.id}
          items={items}
          initial={{
            body: diary.body,
            visibility: diary.visibility,
            photos: diary.photos,
            itemIds: diary.items.map((i) => i.id),
          }}
        />
      </div>
    </div>
  );
}
