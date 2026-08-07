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
const CATEGORIES = [
  "watch", "shoes", "bicycle", "apparel", "camping", "deskterior",
] as const;

export function SearchBar({
  q, tab, category,
}: {
  q: string;
  tab: (typeof TABS)[number];
  category?: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useState(q);

  function apply(next: { q?: string; tab?: string; category?: string | null }) {
    const p = new URLSearchParams();
    const query = next.q ?? draft;
    const nextTab = next.tab ?? tab;
    const c = next.category === undefined ? category : next.category;
    if (query) p.set("q", query);
    if (nextTab !== "items") p.set("tab", nextTab);
    // 방 탭에는 카테고리 필터가 없다 (FR-04-A-09)
    if (c && nextTab !== "rooms") p.set("category", c);
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

      {/* 카테고리 필터 — 아이템·도감 탭에만 (FR-04-A-09) */}
      {tab !== "rooms" && (
        <div className="flex gap-2 overflow-x-auto px-4 py-3 lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip on={!category} onClick={() => apply({ category: null })}>
            {t("filter.all")}
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              on={category === c}
              onClick={() => apply({ category: category === c ? null : c })}
            >
              {t(`category.${c}`)}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: {
  on: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
        on ? "border-foreground bg-foreground font-semibold text-background"
           : "text-muted-foreground hover:text-foreground",
      )}>
      {children}
    </button>
  );
}
