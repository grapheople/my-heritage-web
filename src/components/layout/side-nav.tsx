"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { isNavActive, NAV_ITEMS } from "./nav-items";

/**
 * 좌측 사이드 내비 — `lg`(1024px+) 전용 (D-143).
 *
 * 같은 메뉴 4개가 `sm`·`md`에서는 하단 탭바로, `lg`에서는 여기로 온다.
 * 순서·라벨은 동일하고 위치만 바뀐다 (`NAV_ITEMS` 공유).
 *
 * ## ⚠️ 상단 바에서 좌측으로 옮긴 이유 (D-143)
 * 상단 바는 **가로를 먹고 세로를 남긴다.** 진열은 세로로 길게 스크롤하는
 * 화면이라(D-068) 상단에 고정 바가 있으면 스크롤할 때마다 그만큼 잘린다.
 * 좌측으로 옮기면 **세로를 온전히 콘텐츠에 준다** — 1200px 안에서 진열 5열도
 * 그대로 들어간다 (D-089).
 *
 * ## ⚠️ 진열 열 수를 줄이지 않는다
 * 사이드바가 폭을 먹지만 **1200px 컨테이너 밖에 둔다.** 안에 두면 진열이
 * 좁아져 D-089 가 5열로 넓힌 이유(부피를 살린다)가 무너진다.
 *
 * D-069 — 비로그인·정지 상태에서도 **항상 노출되고 누를 수 있다.** 회색 처리나
 * 숨김을 쓰지 않는다. 권한이 없으면 이동한 화면에서 안내를 띄운다.
 */
export function SideNav({
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
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r bg-background px-3 py-5 lg:flex">
      {/* 워드마크는 미확정이라 텍스트로 둔다 (OI-43). 자리는 여기다 */}
      <Link href="/" className="px-2 pb-6 text-xl font-bold tracking-tight">
        {tApp("title")}
      </Link>

      <nav aria-label={t("new")}>
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, labelKey, Icon }) => {
            const active = isNavActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-accent font-bold text-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <Icon className="size-5 shrink-0" aria-hidden />
                  {/* 3개 언어 중 가장 긴 문자열로 검증한다 — 고정 폭 금지 */}
                  <span className="truncate">{t(labelKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* S-22 알림함 (D-087). **비로그인에게는 노출하지 않는다** (FR-08-A-07) */}
      {loggedIn && <div className="mt-auto px-2">{children}</div>}
    </aside>
  );
}
