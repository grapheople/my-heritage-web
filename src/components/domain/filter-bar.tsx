"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * NEW 피드 상단 줄 — **언어권 필터** (D-138).
 *
 * ## ⚠️ 카테고리 셀렉트가 여기 없다 (D-272)
 * 홈은 **내 관심사 전체**를 보여준다 — 고를 것이 없으므로 컨트롤도 없다.
 * 카테고리를 하나 고르는 곳은 **도감뿐**이다 (`SearchBar`).
 *
 * D-137 의 축은 살아 있다. 단위가 "선택된 1개" 에서 **"내 관심사 집합"** 으로
 * 바뀌었을 뿐이고, 그 집합은 화면에서 고르는 게 아니라 **설정에서** 고른다.
 *
 * **D-082 — 한 줄에 둔다.** 각각 한 줄씩 쓰면 필터가 첫 화면 상단을 다 먹어
 * NEW 피드에서 아이템이 안 보인다 (OI-20).
 *
 * 선택은 URL 쿼리에 싣는다 — 공유 가능하고 뒤로가기가 동작한다.
 */
const LANGS = ["all", "ko", "ja", "en"] as const;

export function FilterBar({ lang }: { lang: string }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();

  function apply(next: { lang: string }) {
    // ⚠️ **다른 쿼리를 지우면 안 된다.** 언어권만 바꾸는 동작인데 새 객체로
    // 만들면 `?tab=following` 같은 상태가 함께 날아간다
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
      {/*
        언어권 — 우측 끝 (D-027). 카테고리 셀렉트가 빠지면서 이 줄에 남은
        컨트롤은 이것 하나다 (D-272)
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

