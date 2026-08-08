import { getTranslations } from "next-intl/server";
import { ReportForm } from "@/components/domain/report-form";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { REPORT_TARGETS, type ReportTarget } from "@/lib/constants";

/**
 * S-15 신고.
 *
 * 라우트로 둔 이유는 §3-1과 같다 — URL 공유·뒤로가기. `?target=`·`?id=`로
 * 대상을 받는다.
 *
 * **정지 유저는 신고할 수 없다** (FR-07-C-05, D-066) — 제재 대상 행동이다.
 */
export default async function ReportPage({
  params,
  searchParams,
}: PageProps<"/[locale]/report">) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations();

  const viewer = await getViewer();
  if (!viewer) {
    redirect({ href: { pathname: "/login", query: { next: "/report" } }, locale });
    return null;
  }

  const raw = typeof sp.target === "string" ? sp.target : "item";
  const target: ReportTarget = REPORT_TARGETS.includes(raw as ReportTarget)
    ? (raw as ReportTarget)
    : "item";
  const targetId = typeof sp.id === "string" ? sp.id : undefined;

  return (
    <div className="px-4 py-5 lg:px-0">
      <h1 className="text-lg font-bold tracking-tight">{t("report.title")}</h1>
      <div className="mt-4">
        <ReportForm target={target} targetId={targetId} />
      </div>
    </div>
  );
}
