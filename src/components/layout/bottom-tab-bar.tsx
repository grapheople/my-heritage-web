"use client";

import { Compass, Home, Search, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * 하단 탭 4개 (myroom-service §1-1).
 *
 * D-069 — 비로그인·정지 상태에서도 **항상 노출되고 누를 수 있다.**
 * 회색 처리나 숨김을 쓰지 않는다. 권한이 없으면 이동한 화면에서 안내를 띄운다
 * (FR-05-B-05, FR-05-B-06).
 */
const TABS = [
  { href: "/", labelKey: "new", Icon: Compass },
  { href: "/me", labelKey: "myRoom", Icon: Home },
  { href: "/search", labelKey: "search", Icon: Search },
  { href: "/market", labelKey: "market", Icon: Store },
] as const;

export function BottomTabBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("new")}
      className="sticky bottom-0 z-40 border-t bg-background/95 backdrop-blur"
    >
      <ul className="mx-auto grid max-w-screen-sm grid-cols-4">
        {TABS.map(({ href, labelKey, Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-xs",
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
