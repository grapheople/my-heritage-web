import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { routing } from "@/i18n/routing";
import "../globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** 3개 언어 전부 정적 생성 (D-003) */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "app" });
  return {
    title: t("title"),
    description: t("description"),
    /**
     * ⚠️ **색인 기본값은 noindex 다** (D-078, CLAUDE.md 규칙 10).
     *
     * 색인할 페이지에서만 `export const metadata = { robots: { index: true } }`
     * 로 켠다 — 도감 상세 · 마켓 · 판매중 공개 아이템 상세뿐이다.
     *
     * 반대로 하면(기본 index + 제외 열거) 화면이 늘어날 때마다 새 화면이
     * 기본 색인 상태로 추가돼 D-078 이 조용히 깨진다. 특히 도감 소유자
     * 목록이 검색엔진에 노출되면 D-031 에서 수용한 절도 리스크가
     * 검색엔진 규모로 커진다.
     */
    robots: { index: false, follow: true },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    // ko/ja/en 모두 LTR — RTL은 대상 아님 (policies/i18n §요약)
    <html
      lang={locale}
      dir="ltr"
      className={`${geist.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
