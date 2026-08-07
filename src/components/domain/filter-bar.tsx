"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * NEW 피드 필터 — 카테고리 + 언어권 (FR-03-A-03, FR-03-B-01).
 *
 * **D-082 — 두 필터를 한 줄에 둔다.** 카테고리는 가로 스크롤 칩, 언어권은
 * 우측 끝 드롭다운. 각각 한 줄씩 쓰면 헤더 + 필터 2줄이 첫 화면 상단을 다 먹어
 * NEW 피드에서 아이템이 안 보인다 (OI-20).
 *
 * 언어권을 작게 둔 것은 **기본값이 `전체`라 자주 바꾸지 않기 때문**이다
 * (D-027, FR-03-B-03). 카테고리는 자주 바꾸므로 칩으로 노출한다.
 *
 * 선택은 URL 쿼리에 싣는다 — 공유 가능하고 뒤로가기가 동작한다.
 */
const CATEGORIES = [
  "watch", "shoes", "bicycle", "apparel", "camping", "deskterior",
] as const;

const LANGS = ["all", "ko", "ja", "en"] as const;

export function FilterBar({
  category,
  lang,
}: {
  category?: string;
  lang: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();

  function apply(next: { category?: string | null; lang?: string }) {
    const p = new URLSearchParams();
    const c = next.category === undefined ? category : next.category;
    const l = next.lang ?? lang;
    if (c) p.set("category", c);
    if (l && l !== "all") p.set("lang", l);
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 border-b bg-background px-4 py-3 lg:top-15 lg:px-0">
      {/* 카테고리 — 가로 스크롤 칩 */}
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

      {/* 언어권 — 우측 끝. 기본값 '전체'라 작게 둔다 (D-027) */}
      <div className="flex shrink-0 items-center border-l pl-3">
        <label className="relative flex items-center gap-1 text-sm text-muted-foreground">
          <span className="sr-only">{t("filter.language")}</span>
          <span aria-hidden>🌐</span>
          <select
            value={lang}
            onChange={(e) => apply({ lang: e.target.value })}
            className="appearance-none bg-transparent pr-4 text-sm outline-none"
          >
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {l === "all" ? t("filter.all") : t(`filter.lang.${l}`)}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute right-0 size-3.5"
          />
        </label>
      </div>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
        on
          ? "border-foreground bg-foreground font-semibold text-background"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
