import { getTranslations } from "next-intl/server";
import { BrandRequestForm } from "@/components/domain/brand-request-form";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";

/** S-17 브랜드 추가 요청 (D-046). 아이템 등록의 브랜드 선택에서 들어온다. */
export default async function BrandRequestPage({
  params,
}: PageProps<"/[locale]/brands/request">) {
  const { locale } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  if (!viewer) {
    redirect({ href: { pathname: "/login", query: { next: "/brands/request" } }, locale });
    return null;
  }

  return (
    <div className="px-4 py-5 lg:px-0">
      <h1 className="text-lg font-bold tracking-tight">{t("brand.requestTitle")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("brand.requestDesc")}</p>
      <div className="mt-5">
        <BrandRequestForm />
      </div>
    </div>
  );
}
