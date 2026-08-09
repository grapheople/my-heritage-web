"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { setCategory } from "@/lib/actions/category";

/**
 * 카테고리 전환 드롭다운 — NEW · 검색 · 마켓 공용 (D-137, D-138).
 *
 * ## ⚠️ `전체` 가 없다
 * 카테고리는 필터가 아니라 **축**이다. 항상 하나가 선택돼 있다.
 *
 * ## ⚠️ 칩이 아니라 드롭다운인 이유
 * 6개를 칩으로 깔면 **상단 한 줄을 통째로 먹는다** — 첫 화면에서 아이템이
 * 밀려난다 (OI-20 과 같은 문제). 축은 자주 바꾸는 값이 아니므로 접어둔다.
 *
 * 선택은 **URL 과 쿠키 양쪽**에 남긴다. URL 은 공유·뒤로가기·색인을 위해,
 * 쿠키는 다음 방문에 같은 카테고리로 들어오기 위해 (D-137).
 */
export function CategorySelect({
  keys,
  active,
}: {
  keys: string[];
  active: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  return (
    <label className="relative flex shrink-0 items-center gap-1 text-sm">
      <span className="sr-only">{t("category.label")}</span>
      <select
        value={active}
        onChange={(e) => {
          const key = e.target.value;
          // 다른 조건(검색어·정렬·언어권)은 유지한다
          const p = new URLSearchParams(window.location.search);
          p.set("category", key);
          startTransition(async () => {
            await setCategory(key);
            router.push(`${pathname}?${p.toString()}`);
          });
        }}
        className="appearance-none bg-transparent pr-4 text-sm font-bold outline-none"
      >
        {keys.map((key) => (
          <option key={key} value={key}>
            {t(`category.${key}`)}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-0 size-3.5"
      />
    </label>
  );
}
