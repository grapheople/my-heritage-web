"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { CategorySelect } from "@/components/domain/category-select";

/**
 * 도감 검색 입력 (D-165).
 *
 * ## ⚠️ 탭이 없다
 * D-160 까지는 **아이템 · 도감 · 방** 3개 탭이었고, D-165 에서 **도감만
 * 남겼다.** `TABS`·`DEFAULT_TAB`·`search.tab.*` 메시지도 함께 없앴다 — 죽은
 * 문구를 남기면 다음 사람이 "탭이 있었는데 왜 안 보이지"로 시간을 쓴다.
 *
 * ⚠️ **경로를 하드코딩하지 않는다.** `usePathname()` 을 써서 화면이 옮겨져도
 * 그대로 동작한다 (옛 `/search` → `/codex` 이동에서 이 덕에 수정이 없었다).
 *
 * **언어권 필터를 적용하지 않는다** (FR-03-B-07) — NEW 피드와 다른 점이다.
 * 카테고리 축은 그대로 걸린다 (FR-04-A-09).
 */
export function SearchBar({
  q,
  categoryKeys,
  category,
}: {
  categoryKeys: string[];
  category: string;
  q: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useState(q);

  function apply() {
    // ⚠️ **`category` 를 보존한다** (D-137). 검색어만 바꾸는 동작인데 축이
    // 초기화되면 다른 카테고리 결과가 튀어나온다
    const p = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search,
    );
    if (draft) p.set("q", draft);
    else p.delete("q");
    // 탭이 없어졌으므로 옛 링크가 실어 온 `tab` 은 버린다 (D-165)
    p.delete("tab");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="sticky top-0 z-20 border-b bg-background">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
        className="px-4 pt-3 lg:px-0"
      >
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("search.placeholder")}
            aria-label={t("nav.codex")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </form>

      {/* 카테고리 축 — 검색도 한 카테고리 안에서다 (D-137·D-138).
          다른 화면과 같은 자리(우측)에 둔다 (D-141) */}
      <div className="flex items-center justify-end gap-3 px-4 pb-3 pt-3 lg:px-0">
        <CategorySelect keys={categoryKeys} active={category} />
      </div>
    </div>
  );
}
