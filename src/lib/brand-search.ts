/**
 * 브랜드 검색 랭킹 (OI-54).
 *
 * ## 왜 필요한가
 * 부분 일치만 쓰면 **짧은 alias 가 노이즈를 만든다.**
 * - `gs` → `Grand Seiko`(alias 가 정확히 `gs`) 와 `G-SHOCK`(`gshock` 이 `gs` 포함)
 * - `アンカー` → `Anchor`(`ブリヂストンアンカー`) 와 `Anker`(`アンカー・ジャパン`)
 *
 * CSV 를 아무리 정리해도 해결되지 않는다 — 데이터가 아니라 **로직 문제**다.
 *
 * ## 두 가지로 푼다
 * 1. **정확 일치 우선 랭킹** — 여기서 처리
 * 2. **카테고리 필터** — 호출부에서 처리. 아이템 등록은 이미 카테고리를 골랐으므로
 *    그 카테고리 브랜드만 넘기면 `Anchor`(자전거)/`Anker`(데스크테리어)는 애초에
 *    후보에 없다
 *
 * 정규화는 D-014 규칙을 따른다 — NFKC + 공백·하이픈 제거 + 소문자.
 * 검색·매칭·import 가 **같은 규칙**을 써야 한다.
 */
export type BrandAliases = { ko?: string[]; ja?: string[]; en?: string[] };

export type SearchableBrand = {
  name: string;
  aliases: BrandAliases;
};

export type BrandHit<T extends SearchableBrand = SearchableBrand> = {
  brand: T;
  /** alias 로 매칭된 경우 그 alias. 원문으로 매칭됐으면 `undefined` (D-047 보조 표기) */
  matchedAlias?: string;
};

export function normalizeBrandToken(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[\s-]/g, "");
}

function aliasList(a: BrandAliases): string[] {
  return [...(a.ko ?? []), ...(a.ja ?? []), ...(a.en ?? [])];
}

/**
 * 랭크가 **낮을수록 앞**이다. 매칭되지 않으면 `null`.
 *
 * | 랭크 | 조건 | 예 (`gs`) |
 * |---|---|---|
 * | 0 | 원문 정확 일치 | — |
 * | 1 | **alias 정확 일치** | `Grand Seiko` (alias `gs`) |
 * | 2 | 원문 접두 일치 | — |
 * | 3 | alias 접두 일치 | — |
 * | 4 | 원문 부분 일치 | — |
 * | 5 | alias 부분 일치 | `G-SHOCK` (`gshock`) |
 *
 * `G-SHOCK` 을 결과에서 빼지 않는다 — 유저가 실제로 그걸 찾을 수도 있다.
 * **순서만 바로잡는다.**
 */
function rank(brand: SearchableBrand, nq: string): { rank: number; alias?: string } | null {
  const name = normalizeBrandToken(brand.name);
  if (name === nq) return { rank: 0 };

  const aliases = aliasList(brand.aliases);
  const exactAlias = aliases.find((a) => normalizeBrandToken(a) === nq);
  if (exactAlias) return { rank: 1, alias: exactAlias };

  if (name.startsWith(nq)) return { rank: 2 };

  const prefixAlias = aliases.find((a) => normalizeBrandToken(a).startsWith(nq));
  if (prefixAlias) return { rank: 3, alias: prefixAlias };

  if (name.includes(nq)) return { rank: 4 };

  const partialAlias = aliases.find((a) => normalizeBrandToken(a).includes(nq));
  if (partialAlias) return { rank: 5, alias: partialAlias };

  return null;
}

/**
 * 검색어로 브랜드를 걸러 랭킹 순으로 돌려준다.
 * 검색어가 비면 **원문 사전순 전체**를 돌려준다 (목록 브라우징).
 *
 * ⚠️ `brands` 는 **이미 카테고리로 걸러진 목록**이어야 한다 (OI-54 해결의 절반).
 */
export function searchBrands<T extends SearchableBrand>(
  brands: T[],
  query: string,
): BrandHit<T>[] {
  const nq = normalizeBrandToken(query);
  if (!nq) {
    return [...brands]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((brand) => ({ brand }));
  }

  const scored: { brand: T; r: number; alias?: string }[] = [];
  for (const brand of brands) {
    const m = rank(brand, nq);
    if (m) scored.push({ brand, r: m.rank, alias: m.alias });
  }

  return scored
    .sort((a, b) => a.r - b.r || a.brand.name.localeCompare(b.brand.name))
    .map(({ brand, alias }) => ({ brand, matchedAlias: alias }));
}
