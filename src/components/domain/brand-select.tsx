"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { searchBrands, type SearchableBrand } from "@/lib/brand-search";
import { cn } from "@/lib/utils";

/**
 * 브랜드 선택 (D-043 · D-047 · OI-54).
 *
 * ## 자유 텍스트가 아니라 마스터 select 다 (D-043)
 * 자유 텍스트면 `Snow Peak` · `스노우피크` · `スノーピーク` 가 각각 다른 브랜드가
 * 되어 **같은 제품의 도감이 언어별로 쪼개진다.**
 *
 * ## alias 로도 찾힌다 (D-047)
 * 한국 유저가 "롤렉스"로 검색해도 `Rolex` 가 나와야 한다. 안 나오면 브랜드가
 * 없는 것으로 오인하고 추가 요청(S-17)을 보낸다.
 *
 * ## OI-54 — 부분 일치 노이즈를 두 가지로 막는다
 * 1. **카테고리 필터** — 이 컴포넌트는 `category` 에 연결된 브랜드만 받는다.
 *    그래서 `アンカー` 를 쳐도 자전거에서는 `Anchor`, 데스크테리어에서는
 *    `Anker` 만 나온다
 * 2. **정확 일치 우선 랭킹** — `lib/brand-search.ts`. `gs` 를 치면 alias 가
 *    정확히 `gs` 인 `Grand Seiko` 가 `G-SHOCK` 보다 앞에 온다
 */
export function BrandSelect({
  value,
  onChange,
  invalid,
  /** 선택된 카테고리 — 이게 없으면 브랜드를 고를 수 없다 (OI-54) */
  category,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  category: string;
}) {
  const t = useTranslations();
  const [q, setQ] = useState("");
  /**
   * 로드된 목록을 **어느 카테고리의 것인지와 함께** 담는다.
   * effect 에서 `setBrands(null)` 로 초기화하면 계단식 렌더가 되므로
   * (react-hooks/set-state-in-effect), 카테고리가 바뀌었는지는 렌더 중에 비교한다.
   */
  const [loaded, setLoaded] = useState<{ category: string; brands: SearchableBrand[] } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/brands?category=${encodeURIComponent(category)}`)
      .then((r) => (r.ok ? r.json() : { brands: [] }))
      .then((d: { brands: SearchableBrand[] }) => {
        if (alive) setLoaded({ category, brands: d.brands });
      })
      .catch(() => {
        if (alive) setLoaded({ category, brands: [] });
      });
    return () => {
      alive = false;
    };
  }, [category]);

  // 카테고리가 바뀌면 이전 목록은 쓰지 않는다
  const brands = loaded?.category === category ? loaded.brands : null;

  const hits = useMemo(
    () => (brands ? searchBrands(brands, q) : []),
    [brands, q],
  );

  if (value) {
    return (
      <div className="mt-1.5 flex items-center gap-2">
        {/* 브랜드명은 원문 고정 — 번역하지 않는다 (D-009) */}
        <span className="rounded-md border px-3 py-2 text-sm font-semibold">{value}</span>
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-sm text-muted-foreground underline"
        >
          {t("common.edit")}
        </button>
      </div>
    );
  }

  return (
    <div className={cn("mt-1.5 rounded-md border", invalid && "border-destructive")}>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("reg.brandSearch")}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {brands && (
          <span className="shrink-0 text-xs text-muted-foreground">{hits.length}</span>
        )}
      </div>

      <ul className="max-h-56 overflow-y-auto">
        {brands === null && (
          <li className="px-3 py-4 text-center text-sm text-muted-foreground">
            {t("common.loading")}
          </li>
        )}
        {brands?.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-muted-foreground">
            {t("brand.none")}
          </li>
        )}
        {hits.map(({ brand, matchedAlias }) => (
          <li key={brand.name}>
            <button
              type="button"
              onClick={() => onChange(brand.name)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
            >
              {brand.name}
              {/* alias 로 매칭됐으면 어떤 별칭이었는지 보여준다 (D-047) —
                  원문이 영문이라 왜 나왔는지 알 수 없기 때문이다 */}
              {matchedAlias && (
                <span className="ml-2 text-xs text-muted-foreground">{matchedAlias}</span>
              )}
            </button>
          </li>
        ))}
        {brands !== null && brands.length > 0 && hits.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-muted-foreground">
            {t("brand.none")}
          </li>
        )}
      </ul>

      {/* 없으면 추가 요청 (S-17, D-046) */}
      <div className="border-t px-3 py-2">
        <Link href="/brands/request" className="text-sm underline">
          {t("brand.requestTitle")} →
        </Link>
      </div>
    </div>
  );
}
