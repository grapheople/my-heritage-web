"use client";

import { ChevronDown, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
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
const CATEGORIES = [
  "watch", "shoes", "bicycle", "apparel", "camping", "deskterior",
] as const;
const CURRENCIES = ["KRW", "JPY", "USD"] as const;

export function MarketControls({
  category,
  currency,
  sort,
}: {
  category?: string;
  currency?: string;
  sort: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();

  const priceSortEnabled = Boolean(currency);

  function apply(next: {
    category?: string | null;
    currency?: string | null;
    sort?: string;
  }) {
    const p = new URLSearchParams();
    const c = next.category === undefined ? category : next.category;
    const cur = next.currency === undefined ? currency : next.currency;
    let s = next.sort ?? sort;
    // 통화를 해제하면 가격순을 유지할 수 없다 — 최신순으로 되돌린다 (FR-02-C-01)
    if (!cur && s !== "recent") s = "recent";
    if (c) p.set("category", c);
    if (cur) p.set("currency", cur);
    if (s !== "recent") p.set("sort", s);
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="sticky top-0 z-20 border-b bg-background lg:top-15">
      {/* 1줄: 카테고리 칩 + 통화 드롭다운 */}
      <div className="flex items-center gap-2 px-4 py-3 lg:px-0">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
