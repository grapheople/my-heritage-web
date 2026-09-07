"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { BrandOption } from "@/lib/data/brand";
import type { SubtypeOption } from "@/lib/subtype";

/**
 * 도감 좁히기 축 — **종류 · 브랜드** (D-310).
 *
 * ## ⚠️ 카테고리는 여기 없다
 * 카테고리는 필터가 아니라 **축**이고(D-137) 쿠키까지 남긴다 —
 * `CategorySelect` 가 단일 출처다. 여기서 또 그리면 두 벌이 된다.
 *
 * ## ⚠️ 종류를 바꾸면 **브랜드를 비운다**
 * 브랜드 scope 는 카테고리 공통 ∪ 종류 전용이다 (D-255). 종류를 바꾸면 고른
 * 브랜드가 그 스코프 밖일 수 있고, 그러면 서버가 값을 버려 **셀렉트에 보이는
 * 값과 실제 조건이 갈린다.** 함께 비우는 편이 정직하다.
 *
 * ## ⚠️ 상태는 URL 에 둔다
 * 도감 링크는 오간다 — "이 브랜드 좀 봐주세요". 컴포넌트 state 로 두면
 * 새로고침·뒤로가기에서 조건이 날아가고 공유도 안 된다 (D-200 과 같은 태도).
 */
export function CodexFilters({
  subtypes,
  subtype,
  brands,
  brand,
}: {
  /** 빈 배열이면 **그리지 않는다** — 종류가 없는 카테고리가 있다 (D-253) */
  subtypes: SubtypeOption[];
  subtype: string;
  brands: BrandOption[];
  /** 선택된 브랜드 **원문**. 표시명이 아니다 (D-276) */
  brand: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  function apply(next: Record<string, string>) {
    const p = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search,
    );
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const qs = p.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  return (
    <>
      {subtypes.length > 0 && (
        <FilterSelect
          label={t("reg.subtype")}
          value={subtype}
          allLabel={t("codex.filterSubtypeAll")}
          options={subtypes.map((s) => ({ value: s.key, label: s.label }))}
          // 종류가 바뀌면 브랜드는 스코프 밖일 수 있다 (위 주석 참조)
          onPick={(v) => apply({ subtype: v, brand: "" })}
        />
      )}
      <FilterSelect
        label={t("codex.filterBrand")}
        value={brand}
        allLabel={t("codex.filterBrandAll")}
        // ⚠️ 값은 원문, 보이는 것은 표시명 (D-276)
        options={brands.map((b) => ({ value: b.name, label: b.label }))}
        onPick={(v) => apply({ brand: v })}
      />
    </>
  );
}

/**
 * `CategorySelect` 와 **같은 모양**으로 둔다 — 나란히 서는 컨트롤이 서로 다른
 * 높이·테두리를 가지면 한 줄이 어긋나 보인다 (design-system §4-2).
 */
function FilterSelect({
  label,
  value,
  allLabel,
  options,
  onPick,
}: {
  label: string;
  value: string;
  allLabel: string;
  options: { value: string; label: string }[];
  onPick: (value: string) => void;
}) {
  return (
    <label className="relative flex h-11 min-w-0 items-center rounded-md border pr-2 text-sm lg:h-9">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onPick(e.target.value)}
        className="h-full max-w-40 appearance-none truncate bg-transparent pl-3 pr-5 text-sm outline-none"
      >
        {/* 빈 값이 "안 고름"이다 — 고르지 않은 상태를 표현할 자리가 필요하다 */}
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2 size-3.5" />
    </label>
  );
}
