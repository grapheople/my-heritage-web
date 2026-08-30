"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { searchBrands, type SearchableBrand } from "@/lib/brand-search";
import { pickDisplayName } from "@/lib/display-name";
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
 * ## ⚠️ 보이는 이름과 저장되는 값이 다르다 (D-276)
 * 화면에는 **관심 언어권에 맞는 표시명**(`지샥`)을 띄우지만, `onChange` 로
 * 올려보내는 값은 **언제나 원문**(`G-SHOCK`)이다. 원문은 `Brand.name` 이고
 * 저장·매칭·CSV upsert 가 전부 그 값을 쓴다 — 표시명을 올려보내면 브랜드가
 * 안 붙거나 엉뚱한 곳에 붙는다.
 *
 * 원문과 표시명이 다르면 **원문을 옆에 함께 보여준다.** 컬렉터는 원문 표기로
 * 물건을 부르므로(D-009) 원문이 사라지면 오히려 못 알아본다.
 *
 * ## ⚠️ 종류를 함께 보낸다 (D-283)
 * 브랜드는 **카테고리 공통 ∪ 종류 전용**이다 (D-255 — 포함적 scope). 종류를
 * 안 보내면 **종류 전용 브랜드가 목록에서 통째로 빠진다.** API 는 처음부터
 * `?subtype=` 을 받고 있었는데 **폼이 보내지 않았다** — 축을 만들고 호출부가
 * 안 읽는, 이 세션에서 반복된 실패다 (D-270 일반화).
 *
 * ⚠️ **좁히는 것이 아니라 더하는 것이다.** 종류를 고르면 선택지가 줄지 않고
 * 늘어난다 — 줄이면 유저가 막히고 브랜드 추가 요청(S-17)이 쌓인다.
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
  /**
   * 선택된 종류 (D-283). 있으면 **그 종류 전용 브랜드가 더해진다** (D-255).
   *
   * ⚠️ 없어도 동작한다 — 종류가 없는 카테고리(시계·신발 등)가 있다
   */
  subtype,
  /**
   * 표시명 우선순위 — 서버가 뷰어의 관심 언어권으로 계산해 넘긴다 (D-276).
   *
   * ⚠️ 여기서 직접 읽지 않는다. `/api/brands` 는 공유 캐시에 들어가므로
   * **응답은 뷰어와 무관해야 하고**, 고르는 일만 이쪽에서 한다
   */
  langOrder,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  category: string;
  subtype?: string;
  langOrder: string[];
}) {
  const t = useTranslations();
  const [q, setQ] = useState("");
  /**
   * 로드된 목록을 **어느 카테고리의 것인지와 함께** 담는다.
   * effect 에서 `setBrands(null)` 로 초기화하면 계단식 렌더가 되므로
   * (react-hooks/set-state-in-effect), 카테고리가 바뀌었는지는 렌더 중에 비교한다.
   */
  const [loaded, setLoaded] = useState<{
    scope: string;
    brands: SearchableBrand[];
  } | null>(null);

  /** 카테고리+종류를 한 값으로 묶는다 — 둘 중 하나만 바뀌어도 목록을 다시 받는다 */
  const scope = `${category}\u0000${subtype ?? ""}`;

  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams({ category });
    if (subtype) qs.set("subtype", subtype);
    fetch(`/api/brands?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : { brands: [] }))
      .then((d: { brands: SearchableBrand[] }) => {
        if (alive) setLoaded({ scope, brands: d.brands });
      })
      .catch(() => {
        if (alive) setLoaded({ scope, brands: [] });
      });
    return () => {
      alive = false;
    };
  }, [category, subtype, scope]);

  // 카테고리나 종류가 바뀌면 이전 목록은 쓰지 않는다
  const brands = loaded?.scope === scope ? loaded.brands : null;

  const hits = useMemo(
    () => (brands ? searchBrands(brands, q) : []),
    [brands, q],
  );

  if (value) {
    /*
      선택된 브랜드의 표시명은 **로드된 목록에서** 찾는다. 목록이 아직 없거나
      (카테고리 전환 직후) 목록 밖 값이면 원문을 그대로 쓴다 — 이름이 잠깐
      비는 것보다 원문이 낫다
    */
    const picked = brands?.find((b) => b.name === value);
    const shown = picked ? pickDisplayName(picked, picked.name, langOrder) : value;
    return (
      <div className="mt-1.5 flex items-center gap-2">
        <span className="rounded-md border px-3 py-2 text-sm font-semibold">
          {shown}
          {/* 원문을 지우지 않는다 — 컬렉터는 원문 표기로 부른다 (D-009) */}
          {shown !== value && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">{value}</span>
          )}
        </span>
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
        {hits.map(({ brand, matchedAlias }) => {
          const shown = pickDisplayName(brand, brand.name, langOrder);
          /*
            ⚠️ 매칭된 문자열이 **이미 화면에 떠 있으면** 또 보여주지 않는다.
            표시명도 검색 대상이 되면서(D-276) `지샥` 으로 찾으면 라벨과
            보조 표기가 같은 말을 두 번 하게 된다
          */
          const hint = matchedAlias && matchedAlias !== shown ? matchedAlias : undefined;
          return (
            <li key={brand.name}>
              <button
                type="button"
                // ⚠️ **원문을 올려보낸다.** 표시명을 보내면 저장이 깨진다 (D-276)
                onClick={() => onChange(brand.name)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
              >
                {shown}
                {/* 원문이 다르면 함께 보여준다 — 컬렉터는 원문으로 부른다 (D-009) */}
                {shown !== brand.name && (
                  <span className="ml-2 text-xs text-muted-foreground">{brand.name}</span>
                )}
                {/* alias 로 매칭됐으면 어떤 별칭이었는지 보여준다 (D-047) */}
                {hint && <span className="ml-2 text-xs text-muted-foreground">{hint}</span>}
              </button>
            </li>
          );
        })}
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
