import { getTranslations } from "next-intl/server";
import { BlockList } from "@/components/domain/block-list";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { DEV_BLOCKS } from "@/lib/dev-fixture";

/** S-19 차단 관리 (D-051). 차단·해제는 어드민을 기다리지 않고 즉시 작동한다. */
export default async function BlocksPage({
  params,
}: PageProps<"/[locale]/me/settings/blocks">) {
  const { locale } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  if (!viewer) {
    redirect({ href: { pathname: "/login", query: { next: "/me/settings/blocks" } }, locale });
    return null;
  }

  return (
    <div className="px-4 py-5 lg:px-0">
      <h1 className="text-lg font-bold tracking-tight">{t("settings.blocks")}</h1>
      {/* 상대에게 알리지 않는다는 사실을 유저에게 알려준다 (FR-05-B-04) */}
      <p className="mt-1 text-sm text-muted-foreground">{t("settings.blocksHint")}</p>
      <div className="mt-4">
        <BlockList blocks={DEV_BLOCKS} />
      </div>
    </div>
  );
}
