"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { CategorySelect } from "@/components/domain/category-select";
import { cn } from "@/lib/utils";

/**
 * 도감 탭의 검색 입력 + 3탭 (FR-04-A-01, D-160).
 *
 * ⚠️ **경로를 하드코딩하지 않는다.** `usePathname()` 을 써서 `/codex` 로 화면이
 * 옮겨져도 그대로 동작한다 (옛 `/search` 에서 옮길 때 이 덕에 수정이 없었다).
 *
 * **일기는 검색되지 않는다** (FR-04-A-02, D-020) — 탭이 3개인 이유다.
 * **언어권 필터를 적용하지 않는다** (FR-03-B-07) — NEW 피드와 다른 점이다.
 * 카테고리 필터는 아이템·도감 탭에만 붙는다 (FR-04-A-09).
 */
/**
 * ⚠️ **도감이 첫 탭이고 기본값이다** (D-160). 탭 3번이 도감이 되면서
 * 화면의 주인이 바뀌었다 — 순서를 그대로 두면 도감 탭에 들어와 아이템
 * 결과가 먼저 뜬다.
 */
const TABS = ["codex", "items", "rooms"] as const;
/** URL 에서 생략하는 값 = 기본 탭. `apply` 와 페이지의 판정이 같아야 한다 */
const DEFAULT_TAB = "codex";
export function SearchBar({ q, tab, categoryKeys, category }: {
  categoryKeys: string[];
  category: string;
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
    if (nextTab && nextTab !== DEFAULT_TAB) p.set("tab", nextTab); else p.delete("tab");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="sticky top-0 z-20 border-b bg-background">
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

      {/* 카테고리 축 — 검색도 한 카테고리 안에서다 (D-137·D-138).
          다른 화면과 같은 자리(우측)에 둔다 (D-141) */}
      <div className="flex items-center justify-end gap-3 px-4 pt-3 lg:px-0">
        <CategorySelect keys={categoryKeys} active={category} />
      </div>

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

