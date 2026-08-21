import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ItemForm } from "@/components/domain/item-form";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { WORKOUT_CATEGORY } from "@/lib/categories";
import { getItemForEdit } from "@/lib/data/item";

/**
 * S-04 아이템 수정.
 *
 * **소유자만** (FR-05-B-01, D-019). **카테고리는 바꿀 수 없다** (FR-05-B-02) —
 * 속성 집합이 달라지기 때문이다. 수정으로 경험치를 주지 않는다 (FR-05-B-05).
 *
 * ## ⚠️ `getItemDetail` 을 쓰지 않는다 (D-157)
 * 그건 **표시용**이다. 라벨·포맷을 거친 값을 폼에 먹이면 `select` 는 옵션 키를
 * 못 찾아 리셋되고, `multiselect` 는 구분자가 달라 선택이 풀리고, 표시 계층에서
 * 빠진 항목(`purchasePrice`)은 저장할 때마다 지워진다. **원본을 주는 경로**를
 * 따로 쓴다.
 */
export default async function EditItemPage({
  params,
}: PageProps<"/[locale]/items/[itemId]/edit">) {
  const { locale, itemId } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  if (!viewer) {
    redirect({ href: "/login", locale });
    return null;
  }

  // 소유 판정까지 여기서 끝난다 — 없는 것과 남의 것을 구분하지 않는다 (D-083)
  const item = await getItemForEdit(itemId, viewer);
  if (!item) notFound();

  return (
    <div className="px-4 py-5 lg:px-0">
      <h1 className="text-lg font-bold tracking-tight">
        {/*
          ⚠️ `getItemForEdit` 의 `categoryKey` 는 **접두 없는 원본**이다
          (`getItemDetail` 은 `category.` 접두를 붙인다) — 형태가 다르므로
          상수와 비교한다 (D-244)
        */}
        {t(item.categoryKey === WORKOUT_CATEGORY ? "reg.editTitleRoutine" : "reg.editTitle")}
      </h1>
      <div className="mt-4">
        {/* itemId 를 넘겨야 수정이 된다 — 안 넘기면 아이템이 하나 더 생긴다 */}
        <ItemForm
          itemId={itemId}
          fixedCategory={item.categoryKey}
          initialValues={item.values}
          initialPhotos={item.photos}
        />
      </div>
    </div>
  );
}
