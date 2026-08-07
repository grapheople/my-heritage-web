"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { isNavActive, NAV_ITEMS } from "./nav-items";

/**
 * 상단 네비 — `lg`(1024px+) 전용 (D-089).
 *
 * 같은 메뉴 4개가 `sm`·`md`에서는 하단 탭바로, `lg`에서는 여기로 온다.
 * 순서·라벨은 동일하고 위치만 바뀐다 (NAV_ITEMS 공유).
 *
 * D-069 — 비로그인·정지 상태에서도 **항상 노출되고 누를 수 있다.** 회색 처리나
 * 숨김을 쓰지 않는다. 권한이 없으면 이동한 화면에서 안내를 띄운다.
 */
export function TopNav({
  loggedIn,
  /** 알림 벨 — 서버 컴포넌트라 slot 으로 받는다 */
  children,
}: {
  loggedIn: boolean;
  children?: React.ReactNode;
}) {
  const t = useTranslations("nav");
  const tApp = useTranslations("app");
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 hidden border-b bg-background/95 backdrop-blur lg:block">
      <div className="mx-auto flex h-15 max-w-[1200px] items-center gap-8 px-6">
        {/* 워드마크는 미확정이라 텍스트로 둔다 (OI-43). 자리는 여기다 */}
        <Link href="/" className="text-lg font-bold tracking-tight">
          {tApp("title")}
        </Link>

        <nav aria-label={t("new")} className="ml-auto">
          <ul className="flex items-center gap-8">
            {NAV_ITEMS.map(({ href, labelKey, Icon }) => {
              const active = isNavActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 py-4 text-sm transition-colors",
                      active
                        ? "border-b-2 border-foreground font-semibold text-foreground"
                        : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {/* 3개 언어 중 가장 긴 문자열로 검증한다 — 고정 폭 금지 */}
                    <span>{t(labelKey)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* S-22 알림함 (D-087). **비로그인에게는 노출하지 않는다** (FR-08-A-07) */}
        {loggedIn && children}
      </div>
    </header>
  );
}
