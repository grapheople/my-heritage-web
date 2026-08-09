"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * 통합 검색 입력 + 3탭 (FR-04-A-01).
 *
 * **일기는 검색되지 않는다** (FR-04-A-02, D-020) — 탭이 3개인 이유다.
 * **언어권 필터를 적용하지 않는다** (FR-03-B-07) — NEW 피드와 다른 점이다.
 * 카테고리 필터는 아이템·도감 탭에만 붙는다 (FR-04-A-09).
 */
const TABS = ["items", "codex", "rooms"] as const;
export function SearchBar({ q, tab }: {
  q: string;
  tab: (typeof TABS)[number];
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useState(q);

  function apply(next: { q?: string; tab?: string }) {
    // ⚠️ **`category` 를 보존한다** (D-137). 검색어·탭만 바꾸는 동작인데
    // 축이 초기화되면 다른 카테고리 결과가 튀어나온다
    const p = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search,
    );
    const nextQ = next.q ?? q;
    const nextTab = next.tab ?? tab;
    if (nextQ) p.set("q", nextQ); else p.delete("q");
    if (nextTab && nextTab !== "items") p.set("tab", nextTab); else p.delete("tab");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="sticky top-0 z-20 border-b bg-background lg:top-15">
      <form
        onSubmit={(e) => { e.preventDefault(); apply({}); }}
        className="px-4 pt-3 lg:px-0"
      >
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("search.placeholder")}
            aria-label={t("nav.search")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </form>

      <div className="flex px-4 lg:px-0" role="tablist">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => apply({ tab: k })}
            className={cn(
              "flex-1 border-b-2 px-4 py-3 text-sm transition-colors",
              tab === k
                ? "border-foreground font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`search.tab.${k}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

