"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { isNavActive, NAV_ITEMS } from "./nav-items";

/**
 * 하단 탭 4개 — `sm`·`md`(~1023px) 전용 (myroom-service §1-1, D-089).
 * `lg`에서는 숨기고 `SideNav`가 같은 메뉴를 **좌측**에 낸다 (D-143). 배열은 NAV_ITEMS 공유.
 *
 * D-069 — 비로그인·정지 상태에서도 **항상 노출되고 누를 수 있다.**
 * 회색 처리나 숨김을 쓰지 않는다. 권한이 없으면 이동한 화면에서 안내를 띄운다
 * (FR-05-B-05, FR-05-B-06).
 */
export function BottomTabBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("new")}
      className="sticky bottom-0 z-40 border-t bg-background/95 backdrop-blur lg:hidden"
    >
      {/* 탭 4개가 태블릿에서 과하게 벌어지지 않게 40rem 으로 묶는다.
          `max-w-screen-sm` 은 Tailwind v4 에서 동작하지 않는다 */}
      <ul className="mx-auto grid max-w-[40rem] grid-cols-4">
        {NAV_ITEMS.map(({ href, labelKey, Icon }) => {
          const active = isNavActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // 터치 타깃 최소 44px (design-system.md §8)
                  "flex min-h-11 flex-col items-center gap-1 py-2 text-[10px]",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {/* 3개 언어 중 가장 긴 문자열로 레이아웃을 검증한다 —
                    버튼·탭에 고정 폭을 쓰지 않는다 (policies/i18n §5) */}
                <span className="max-w-full truncate">{t(labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
