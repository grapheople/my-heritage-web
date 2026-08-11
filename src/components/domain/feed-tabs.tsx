"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * NEW 피드 탭 — 전체 / 팔로잉 (D-175, OI-86 해소).
 *
 * ## ⚠️ 카테고리 축과 언어권을 **보존한다**
 * 카테고리는 필터가 아니라 축이고(D-137), 탭만 바꾸는 동작인데 축이 초기화되면
 * 다른 카테고리 결과가 튀어나온다. `SearchBar` 가 같은 실수를 했던 지점이다.
 *
 * ## ⚠️ 기본 탭은 URL 에서 생략한다
 * `전체` 가 기본이므로 `?tab=all` 을 남기지 않는다. 홈 URL 이 색인 대상이라
 * (D-109) 같은 화면이 두 주소로 갈리면 안 된다.
 */
const TABS = ["all", "following"] as const;
const DEFAULT_TAB = "all";

export function FeedTabs({ tab }: { tab: (typeof TABS)[number] }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();

  function apply(next: string) {
    const p = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search,
    );
    if (next !== DEFAULT_TAB) p.set("tab", next);
    else p.delete("tab");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex border-b px-4 lg:px-0" role="tablist">
      {TABS.map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={tab === k}
          onClick={() => apply(k)}
          className={cn(
            "flex-1 border-b-2 px-4 py-3 text-sm transition-colors",
            tab === k
              ? "border-foreground font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t(`feed.tab${k === "all" ? "All" : "Following"}`)}
        </button>
      ))}
    </div>
  );
}
