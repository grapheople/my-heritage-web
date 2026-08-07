import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ItemForm } from "@/components/domain/item-form";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { findItem } from "@/lib/dev-fixture";

/**
 * S-04 아이템 수정.
 *
 * **소유자만** (FR-05-B-01, D-019). **카테고리는 바꿀 수 없다** (FR-05-B-02) —
 * 속성 집합이 달라지기 때문이다. 수정으로 경험치를 주지 않는다 (FR-05-B-05).
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

  const item = findItem(itemId);
  if (!item) notFound();
  if (viewer.roomId !== item.roomId) notFound();

  const category = item.categoryKey.replace(/^category\./, "");
  const initial: Record<string, string> = {};
  for (const a of item.attrs) initial[a.labelKey.replace(/^attr\./, "")] = a.value;
  if (item.owner.purchasedFrom) initial.purchasedFrom = item.owner.purchasedFrom;
  if (item.owner.purchaseDate) initial.purchaseDate = item.owner.purchaseDate;
  if (item.refUrl) initial.refUrl = item.refUrl;

  return (
    <div className="px-4 py-5 lg:px-0">
      <h1 className="text-lg font-bold tracking-tight">{t("reg.editTitle")}</h1>
      <div className="mt-4">
        <ItemForm fixedCategory={category} initialValues={initial} />
      </div>
    </div>
  );
}
