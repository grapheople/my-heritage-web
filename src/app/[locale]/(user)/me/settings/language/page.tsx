import { getTranslations } from "next-intl/server";
import { getViewer } from "@/lib/auth/viewer";
import { LanguageSwitcher } from "@/components/domain/language-switcher";

/**
 * S-12 언어 설정.
 * **비로그인도 접근 가능하다** — 선택은 쿠키로 보존된다 (FR-05-B-03).
 */
export default async function LanguageSettingsPage({
  params,
}: PageProps<"/[locale]/me/settings/language">) {
  const { locale } = await params;
  const t = await getTranslations();
  return (
    <div className="px-4 py-5 lg:px-0">
      <h1 className="text-lg font-bold tracking-tight">{t("settings.language")}</h1>
      <div className="mt-4">
        {/* 로그인 유저는 `User.language` 에도 저장한다 (D-180) */}
        <LanguageSwitcher current={locale} loggedIn={(await getViewer()) !== null} />
      </div>
    </div>
  );
}
