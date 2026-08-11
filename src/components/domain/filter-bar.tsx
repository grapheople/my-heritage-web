"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { CategorySelect } from "@/components/domain/category-select";

/**
 * NEW 피드 상단 줄 — **카테고리 축 + 언어권 필터** (D-138).
 *
 * **D-082 — 한 줄에 둔다.** 각각 한 줄씩 쓰면 필터가 첫 화면 상단을 다 먹어
 * NEW 피드에서 아이템이 안 보인다 (OI-20). 카테고리를 칩 6개로 깔았을 때
 * 정확히 그 문제가 생겨서 **드롭다운으로 접었다**.
 *
 * ⚠️ 카테고리는 필터가 아니라 **축**이다 (D-137) — `전체` 가 없고 항상
 * 하나가 선택돼 있다. 그래서 왼쪽에 두고 글자를 굵게 준다. 언어권은 기본값이
 * `전체`라 자주 바꾸지 않으므로 오른쪽에 작게 둔다 (D-027, FR-03-B-03).
 *
 * 선택은 URL 쿼리에 싣는다 — 공유 가능하고 뒤로가기가 동작한다.
 */
const LANGS = ["all", "ko", "ja", "en"] as const;

export function FilterBar({
  lang,
  categoryKeys,
  category,
}: {
  lang: string;
  categoryKeys: string[];
  category: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();

  function apply(next: { lang: string }) {
    // ⚠️ **`category` 를 지우면 안 된다** (D-137). 언어권만 바꾸는 동작인데
    // 카테고리까지 날아가면 보고 있던 축이 초기화된다
    const p = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search,
    );
    if (next.lang && next.lang !== "all") p.set("lang", next.lang);
    else p.delete("lang");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    /*
      ⚠️ **여기서 `sticky` 를 걸지 않는다** (D-176). 탭이 이 아래로 내려가면서
      (셀렉트 → 탭 순서) **둘이 한 덩어리로 고정돼야** 한다. 각자 sticky 를 걸면
      탭만 스크롤에 밀려 올라간다 — 고정은 호출부의 감싸는 블록이 한다.
    */
    <div className="flex items-center justify-end gap-3 px-4 py-3 lg:px-0">
      {/* ⚠️ 둘 다 **우측**에 모은다 (D-141). 왼쪽에 하나, 오른쪽에 하나로
          갈라놓으면 시선이 두 번 움직인다 — 같은 성격의 조작이라 붙여 둔다.
          카테고리가 축이므로 언어권보다 앞(왼쪽)에 온다 */}
      <CategorySelect keys={categoryKeys} active={category} />

      {/*
        언어권 — 우측 끝 (D-027).
        ⚠️ **카테고리 셀렉트와 같은 모양으로 맞춘다** (D-177). 한쪽만 테두리 있는
        컨트롤이 되면 같은 성격의 조작 두 개가 다르게 보인다. 구분선(`border-l`)은
        걷었다 — 테두리 있는 두 상자 사이에 선을 또 넣으면 경계가 세 겹이 된다
      */}
      <div className="flex shrink-0 items-center">
        <label className="relative flex h-11 items-center rounded-md border pl-3 pr-2 text-sm text-muted-foreground lg:h-9">
          <span className="sr-only">{t("filter.language")}</span>
          <span aria-hidden>🌐</span>
          <select
            value={lang}
            onChange={(e) => apply({ lang: e.target.value })}
            className="h-full appearance-none bg-transparent pl-1.5 pr-5 text-sm outline-none"
          >
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {l === "all" ? t("filter.all") : t(`filter.lang.${l}`)}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute right-2 size-3.5"
          />
        </label>
      </div>
    </div>
  );
}

