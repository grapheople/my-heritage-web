import { getLocale, getTranslations } from "next-intl/server";
import { CategoryGate } from "@/components/domain/category-gate";
import { CodexRow } from "@/components/domain/codex-row";
import { EmptyState } from "@/components/domain/empty-state";
import { SearchBar } from "@/components/domain/search-bar";
import { getViewer } from "@/lib/auth/viewer";
import type { Locale } from "@/i18n/routing";
import { resolveCategory } from "@/lib/category-scope";
import { CODEX_BROWSE_LIMIT, listCodex, searchCodex } from "@/lib/data/codex";
import { listBrandOptions } from "@/lib/data/brand";
import { viewerLangOrder } from "@/lib/language-scope";
import { getSubtypeOptions } from "@/lib/subtype";

/**
 * S-25 도감 탭 — 브라우즈 + 검색 (D-160).
 *
 * ## ⚠️ 검색 대상은 **도감뿐이다** (D-165)
 * D-160 에서 옛 S-08(검색 탭)을 흡수할 때는 아이템·방 서브탭을 함께 옮겼다.
 * D-165 에서 **그 두 탭을 없앴다** — 이 화면은 도감을 찾는 화면이다.
 *
 * ⚠️ **아이템 검색·방 검색은 이 서비스에 더 이상 없다** (D-165). `FR-04-A-05`
 * (아이템 명칭·속성값 검색)·`FR-04-A-06·07`(방 이름 검색)은 **폐기**됐다.
 * 되살리려면 화면만 되돌리는 것이 아니라 그 FR 부터 다시 세워야 한다.
 *
 * | 상태 | 화면 |
 * |---|---|
 * | 검색어 없음 · 종류·브랜드 안 고름 | **좁히기 안내** (D-310) |
 * | 검색어 없음 · 종류 또는 브랜드 고름 | **도감 브라우즈** — 최근 추가순 |
 * | 검색어 있음 | **도감 검색 결과** — 게이트를 걸지 않는다 |
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 도감은 원문 명칭·고유값·**3개 언어 alias** 전부 대상 | D-009, FR-04-A-04 |
 * | 카테고리 축이 걸린다 — **하나를 고른다** | D-137, FR-04-A-09 |
 * | 고를 수 있는 목록은 **내 관심사만** | **D-273** |
 * | 종류·브랜드를 고르기 전에는 목록을 내지 않는다 | **D-310** |
 * | **언어권 필터를 적용하지 않는다** | D-027, FR-03-B-07 |
 * | 병합된 도감은 결과에 없다 (survivor 를 낸다) | D-016 |
 */
export default async function CodexPage({
  searchParams,
}: PageProps<"/[locale]/codex">) {
  const sp = await searchParams;

  const q = typeof sp.q === "string" ? sp.q : "";
  /*
    ⚠️ **여기만 하나를 고른다** (D-272). 홈·마켓은 관심사 전체로 바뀌었지만
    도감은 제품 사전을 훑는 화면이라 한 카테고리 안에서 깊이 봐야 한다 —
    시계 레퍼런스를 찾는 중에 텐트가 섞이면 목록이 못 쓰게 된다.

    `scope.keys` 는 **내 관심사로 좁혀진 목록**이다 (D-273)
  */
  const scope = await resolveCategory(
    typeof sp.category === "string" ? sp.category : undefined,
  );
  const category = scope.key;

  /*
    ⚠️ **URL 값을 그대로 믿지 않는다.** 카테고리를 바꾸면 `CategorySelect` 가
    두 값을 지우지만, 손으로 만든 주소·옛 링크는 다른 카테고리의 종류·브랜드를
    싣고 올 수 있다. 그대로 걸면 **아무것도 안 걸리는 조건**으로 빈 목록이
    나오고, 유저는 "이 카테고리에 도감이 없다"로 읽는다 — 목록에 없으면 버린다.
  */
  // `getLocale()` 의 반환형은 넓다 — 라벨은 3개 언어뿐이라 여기서 좁힌다
  const raw = await getLocale();
  const locale: Locale = raw === "ja" || raw === "en" ? raw : "ko";
  const subtypes = await getSubtypeOptions(category, locale);
  const wantSubtype = typeof sp.subtype === "string" ? sp.subtype : "";
  const subtype = subtypes.some((s) => s.key === wantSubtype) ? wantSubtype : "";
  /* 종류를 고르면 **그 종류 전용 브랜드가 더해진다** (D-255·D-283) */
  const brands = await listBrandOptions({
    categoryKey: category,
    subtypeKey: subtype || null,
    langOrder: await viewerLangOrder(),
  });
  const wantBrand = typeof sp.brand === "string" ? sp.brand : "";
  const brand = brands.some((b) => b.name === wantBrand) ? wantBrand : "";

  return (
    <div>
      <SearchBar
        q={q}
        categoryKeys={scope.keys}
        category={category}
        subtypes={subtypes}
        subtype={subtype}
        brands={brands}
        brand={brand}
      />

      {/*
        ⚠️ 고른 적이 없으면 **여기서 묻는다** (D-272). 홈에서 걷어낸 선택
        화면이 도감으로 왔다 — 도감은 여전히 한 카테고리 안에서만 보여주므로,
        고른 적이 없으면 유저는 자기가 무엇을 보고 있는지 모른다.

        ⚠️ 콘텐츠 **위에** 덮는다. 대체하지 않는다 — 크롤러는 목록을 읽어야
        하고(D-109) 관람자는 벽부터 만나면 안 된다(D-069)
      */}
      {!scope.chosen && <CategoryGate keys={scope.keys} />}

      {q ? (
        // ⚠️ 검색어가 있으면 **게이트를 걸지 않는다.** 검색어 자체가 좁히기이고,
        // 여기서 또 막으면 유저는 검색이 고장난 것으로 읽는다
        <CodexResults q={q} category={category} subtype={subtype} brand={brand} />
      ) : subtype || brand ? (
        <CodexBrowse category={category} subtype={subtype} brand={brand} />
      ) : (
        <FilterGate hasSubtypes={subtypes.length > 0} />
      )}
    </div>
  );
}

/**
 * 도감 브라우즈 — 최근 추가순 (D-160).
 *
 * ⚠️ **절단을 숨기지 않는다.** 상한을 넘으면 전체 개수를 함께 보여주고 검색을
 * 유도한다 — 목록이 끝인 것처럼 보이면 "도감에 이것뿐"으로 읽힌다.
 */
async function CodexBrowse({
  category,
  subtype,
  brand,
}: {
  category?: string;
  subtype?: string;
  brand?: string;
}) {
  const t = await getTranslations();
  const viewer = await getViewer();
  const { total, hits } = await listCodex({
    category,
    subtype,
    brand,
    viewer,
    // ⚠️ 보유자 수는 로그인 유저에게만 (D-078·D-096). 조회 계층이 판정한다
    withOwnerCount: viewer !== null,
  });

  if (hits.length === 0) return <EmptyState title={t("codex.empty")} />;
  return (
    <div className="py-1 lg:py-2">
      <p className="px-4 pt-2 pb-1 text-xs text-muted-foreground lg:px-0">
        {t("codex.recent")}
      </p>
      {hits.map(({ entry, ownerCount }) => (
        <CodexRow key={entry.id} entry={entry} ownerCount={ownerCount} />
      ))}
      {total > CODEX_BROWSE_LIMIT && (
        <p className="px-4 py-4 text-xs text-muted-foreground lg:px-0">
          {t("codex.more", { shown: hits.length, total })}
        </p>
      )}
    </div>
  );
}

/** 도감 — 원문 명칭·고유값·alias 전부 매칭 (FR-04-A-04) */
async function CodexResults({
  q,
  category,
  subtype,
  brand,
}: {
  q: string;
  category?: string;
  subtype?: string;
  brand?: string;
}) {
  const t = await getTranslations();
  const viewer = await getViewer();
  // ⚠️ 보유자 수는 로그인 유저에게만 (D-078·D-096). 조회 계층이 판정한다 —
  // 비로그인이면 `ownerCount` 키 자체가 응답에 없다
  const hits = await searchCodex(q, {
    category,
    subtype,
    brand,
    viewer,
    withOwnerCount: viewer !== null,
  });

  if (hits.length === 0) return <EmptyState title={t("empty.search")} />;
  return (
    <div className="py-1 lg:py-2">
      {hits.map(({ entry, ownerCount, matchedAlias }) => (
        <CodexRow
          key={entry.id}
          entry={entry}
          matchedAlias={matchedAlias}
          // ⚠️ 비로그인이면 조회 계층이 **애초에 넣지 않았다** (D-096)
          ownerCount={ownerCount}
        />
      ))}
    </div>
  );
}

/**
 * 좁히기 안내 — 종류·브랜드를 고르기 전에는 목록을 내지 않는다 (D-310).
 *
 * ## ⚠️ 종류가 없는 카테고리는 **문구가 다르다**
 * 시계·신발은 종류 자체가 없다 (D-253). "브랜드 또는 종류를 고르세요"라고
 * 하면 화면에 없는 컨트롤을 찾게 된다 — 그 카테고리에서는 브랜드만 말한다.
 *
 * ## ⚠️ 검색은 여전히 열려 있다
 * 게이트 아래에서도 상단 검색창은 살아 있고, 검색어를 넣으면 결과가 바로
 * 나온다. 안내 문구가 그 사실을 말해준다 — 안 그러면 막다른 길로 보인다.
 */
async function FilterGate({ hasSubtypes }: { hasSubtypes: boolean }) {
  const t = await getTranslations();
  return (
    <EmptyState
      title={hasSubtypes ? t("codex.pickFilter") : t("codex.pickBrand")}
      description={t("codex.pickFilterDesc")}
    />
  );
}
