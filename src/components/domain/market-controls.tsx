"use client";

import { ChevronDown, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { CategorySelect } from "@/components/domain/category-select";
import { cn } from "@/lib/utils";

/**
 * 마켓 필터 + 정렬 (FR-02-B, FR-02-C).
 *
 * **필터는 카테고리 + 통화 2개뿐이다** (FR-02-B-01).
 * **언어권 필터를 제공하지 않는다** (FR-02-B-02, D-049) — NEW 피드와 다른 점이다.
 *
 * ⚠️ **가격순 정렬은 단일 통화가 선택됐을 때만 활성화된다** (FR-02-C-01).
 * 환율을 쓰지 않으므로(D-011) 통화가 섞인 목록을 가격으로 줄 세울 수 없다.
 * 비활성일 때 **왜 못 쓰는지 알려주는 것이 이 UI의 핵심**이다 (FR-02-C-02) —
 * 그냥 회색으로 두면 유저는 고장난 줄 안다.
 */
const CURRENCIES = ["KRW", "JPY", "USD"] as const;

export function MarketControls({
  currency,
  sort,
  categoryKeys,
  category,
}: {
  currency?: string;
  sort: string;
  categoryKeys: string[];
  category: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();

  const priceSortEnabled = Boolean(currency);

  function apply(next: { currency?: string | null; sort?: string }) {
    // ⚠️ **`category` 를 보존한다** (D-137). 빈 URLSearchParams 로 새로 만들면
    // 통화만 바꿔도 보고 있던 카테고리 축이 초기화된다
    const p = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search,
    );
    const cur = next.currency === undefined ? currency : next.currency;
    let s = next.sort ?? sort;
    // 통화를 해제하면 가격순을 유지할 수 없다 — 최신순으로 되돌린다 (FR-02-C-01)
    if (!cur && s !== "recent") s = "recent";
    if (cur) p.set("currency", cur); else p.delete("currency");
    if (s !== "recent") p.set("sort", s); else p.delete("sort");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="sticky top-0 z-20 border-b bg-background lg:top-15">
      {/* 카테고리 축(왼쪽) + 통화 (D-138) */}
      <div className="flex items-center gap-3 px-4 py-2.5 lg:px-0">
        <CategorySelect keys={categoryKeys} active={category} />
        <span className="flex-1" />
        <div className="flex shrink-0 items-center border-l pl-3">
          <label className="relative flex items-center gap-1 text-sm text-muted-foreground">
            <span className="sr-only">{t("filter.currency")}</span>
            <select
              value={currency ?? ""}
              onChange={(e) => apply({ currency: e.target.value || null })}
              className="appearance-none bg-transparent pr-4 text-sm outline-none"
            >
              <option value="">{t("market.allCurrencies")}</option>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute right-0 size-3.5" />
          </label>
        </div>
      </div>

      {/* 정렬 */}
      <div className="flex items-center gap-3 px-4 pb-3 lg:px-0">
        <SortButton on={sort === "recent"} onClick={() => apply({ sort: "recent" })}>
          {t("market.sortRecent")}
        </SortButton>
        <SortButton
          on={sort === "price"}
          disabled={!priceSortEnabled}
          onClick={() => apply({ sort: "price" })}
        >
          {t("market.sortPrice")}
        </SortButton>

        {/* ⚠️ 비활성 이유를 반드시 알려준다 (FR-02-C-02) */}
        {!priceSortEnabled && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Info aria-hidden className="size-3.5 shrink-0" />
            {t("market.sortPriceHint")}
          </p>
        )}
      </div>
    </div>
  );
}


function SortButton({ on, disabled, onClick, children }: {
  on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
      className={cn(
        "text-sm transition-colors",
        disabled && "cursor-not-allowed text-muted-foreground/50",
        !disabled && on && "font-bold text-foreground underline underline-offset-4",
        !disabled && !on && "text-muted-foreground hover:text-foreground",
      )}>
      {children}
    </button>
  );
}
