import { getTranslations } from "next-intl/server";
import { ItemForm } from "@/components/domain/item-form";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";

/**
 * S-04 아이템 등록 (D-076).
 * 2단계 — ① 카테고리 ② 입력. 자동 채움은 ②의 상태 변화다 (FR-05-A-08·09).
 */
export default async function NewItemPage({
  params,
}: PageProps<"/[locale]/items/new">) {
  const { locale } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  if (!viewer) {
    redirect({ href: { pathname: "/login", query: { next: "/items/new" } }, locale });
    return null;
  }

  return (
    <div className="px-4 py-5 lg:px-0">
      <h1 className="text-lg font-bold tracking-tight">{t("reg.newTitle")}</h1>
      <div className="mt-4">
        <ItemForm />
      </div>
    </div>
  );
}
