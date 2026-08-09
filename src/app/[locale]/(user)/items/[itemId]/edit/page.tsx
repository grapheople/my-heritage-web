import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ItemForm } from "@/components/domain/item-form";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getViewer } from "@/lib/auth/viewer";
import { getItemDetail } from "@/lib/data/item";

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

  const item = await getItemDetail(itemId, viewer, locale as Locale);
  if (!item) notFound();
  if (viewer.roomId !== item.roomId) notFound();

  const category = item.categoryKey.replace(/^category\./, "");
  const initial: Record<string, string> = {};
  for (const a of item.attrs) initial[a.key] = a.value;
  if (item.owner.purchasedFrom) initial.purchasedFrom = item.owner.purchasedFrom;
  if (item.owner.purchaseDate) initial.purchaseDate = item.owner.purchaseDate;
  // ⚠️ 속성 key 는 `referenceUrl` 이다. `refUrl` 로 넣으면 폼이 못 찾아
  // 빈 값으로 저장돼 링크가 사라진다
  if (item.refUrl) initial.referenceUrl = item.refUrl;
  // 별칭은 속성이 아니라 별개 컬럼이다 (D-112) — `__` 로 구분한다
  if (item.nickname) initial.__nickname = item.nickname;

  return (
    <div className="px-4 py-5 lg:px-0">
      <h1 className="text-lg font-bold tracking-tight">{t("reg.editTitle")}</h1>
      <div className="mt-4">
        {/* itemId 를 넘겨야 수정이 된다 — 안 넘기면 아이템이 하나 더 생긴다 */}
        <ItemForm
          itemId={item.id}
          fixedCategory={category}
          initialValues={initial}
          initialPhotos={item.photos}
        />
      </div>
    </div>
  );
}
