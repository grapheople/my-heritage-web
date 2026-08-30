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
 * 정규화는 **D-014 규칙 그대로**다 — NFKC + 공백·하이픈·**언더스코어** 제거
 * + 대소문자 통일. 검색·매칭·import 가 **같은 규칙**을 써야 한다.
 */
export type BrandAliases = { ko?: string[]; ja?: string[]; en?: string[] };

export type SearchableBrand = {
  /** 원문 — **식별자다.** 저장·매칭이 이 값을 쓴다 (D-276) */
  name: string;
  aliases: BrandAliases;
  /**
   * 표시용 언어별 명칭 (D-276). **검색 대상에도 넣는다** — 화면에 `지샥` 이
   * 보이는데 `지샥` 으로 못 찾으면 유저는 목록이 고장난 것으로 읽는다.
   *
   * ⚠️ alias 를 **대체하지 않는다.** alias 에는 3필드로 담기지 않는 약어
   * 89건(`gs`·`ap`·`jlc`)이 있어 지우면 그 검색어가 죽는다
   */
  nameKo?: string | null;
  nameJa?: string | null;
  nameEn?: string | null;
  /**
   * 노출 우선순위 — **높을수록 앞** (D-285). 0 = 지정 안 됨.
   *
   * ⚠️ **랭킹을 이기지 않는다.** `gs` 를 쳤을 때 alias 가 정확히 `gs` 인
   * `Grand Seiko` 가 `G-SHOCK` 보다 먼저 와야 한다 (OI-54) — 우선순위를
   * 랭킹보다 앞에 두면 그 순서가 뒤집힌다. **같은 랭크 안에서만** 가른다
   */
  displayOrder?: number;
};

export type BrandHit<T extends SearchableBrand = SearchableBrand> = {
  brand: T;
  /** alias 로 매칭된 경우 그 alias. 원문으로 매칭됐으면 `undefined` (D-047 보조 표기) */
  matchedAlias?: string;
};

/**
 * D-014 정규화. **검색·도감 매칭·CSV import 가 이 함수 하나만 쓴다.**
 *
 * | 제거 | 보존 |
 * |---|---|
 * | 공백 · 하이픈 · **언더스코어** | **점 · 슬래시** |
 *
 * ⚠️ **점·슬래시를 지우지 않는 것이 의도다** (D-014). 오메가 레퍼런스
 * `310.30.42.50.01.002` 처럼 구분자가 의미를 갖는 체계가 있다. 지우면
 * 서로 다른 제품이 **오병합**되고, 되돌리기 비용이 갈라짐 비용보다 크다 (R2).
 *
 * ⚠️ 유사 문자 치환(`O`↔`0`)도 하지 않는다 — 실제 코드 체계에 둘 다 쓰인다.
 *
 * ⚠️ **소문자로 모은다** — 방향은 무관하고 **한 방향으로 일관되면 된다.**
 * D-014 초판이 "대문자 변환"으로 적혀 있었으나 **D-199 에서 문서를 소문자로
 * 정정**했다 (정책은 "대소문자를 무시한다"이지 폴딩 방향이 아니다).
 */
export function normalizeBrandToken(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[\s\-_]/g, "");
}

function aliasList(a: BrandAliases): string[] {
  return [...(a.ko ?? []), ...(a.ja ?? []), ...(a.en ?? [])];
}

/**
 * 검색에 쓰는 **보조 문자열 전부** — alias + 표시용 언어별 명칭 (D-276).
 *
 * ⚠️ 표시명을 여기 넣지 않으면 **화면에 보이는 이름으로 검색이 안 된다.**
 * `지샥` 이 목록에 떠 있는데 `지샥` 을 치면 안 나오는 상태가 된다
 */
function searchableStrings(brand: SearchableBrand): string[] {
  return [
    ...aliasList(brand.aliases),
    brand.nameKo,
    brand.nameJa,
    brand.nameEn,
  ].filter((v): v is string => Boolean(v && v.trim()));
}

/**
 * 랭크가 **낮을수록 앞**이다. 매칭되지 않으면 `null`.
 *
 * | 랭크 | 조건 | 예 (`gs`) |
 * |---|---|---|
 * | 0 | 원문 정확 일치 | — |
 * | 1 | **alias·표시명 정확 일치** | `Grand Seiko` (alias `gs`) |
 * | 2 | 원문 접두 일치 | — |
 * | 3 | alias·표시명 접두 일치 | — |
 * | 4 | 원문 부분 일치 | — |
 * | 5 | alias·표시명 부분 일치 | `G-SHOCK` (`gshock`) |
 *
 * ⚠️ 랭크 1·3·5 의 후보에 **표시용 언어별 명칭이 함께 들어간다** (D-276) —
 * 화면에 보이는 이름으로 검색이 되어야 한다.
 *
 * `G-SHOCK` 을 결과에서 빼지 않는다 — 유저가 실제로 그걸 찾을 수도 있다.
 * **순서만 바로잡는다.**
 */
function rank(brand: SearchableBrand, nq: string): { rank: number; alias?: string } | null {
  const name = normalizeBrandToken(brand.name);
  if (name === nq) return { rank: 0 };

  const aliases = searchableStrings(brand);
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
 * 검색어가 비면 **호출부가 준 순서 그대로** 돌려준다 (목록 브라우징) —
 * `/api/brands` 가 이미 우선순위 순으로 내려준다 (D-285).
 *
 * ⚠️ **우선순위는 랭킹 다음이다.** 정확 일치가 먼저고(OI-54), 같은 랭크
 * 안에서만 우선순위가 가른다.
 *
 * ⚠️ `brands` 는 **이미 카테고리로 걸러진 목록**이어야 한다 (OI-54 해결의 절반).
 */
export function searchBrands<T extends SearchableBrand>(
  brands: T[],
  query: string,
): BrandHit<T>[] {
  const nq = normalizeBrandToken(query);
  /*
    ⚠️ **높을수록 앞이라 뺄셈 방향이 반대다** (D-285). 이렇게 두면 기본값 0 이
    자연히 맨 뒤로 간다 — "낮을수록 앞" 이면 0 이 가장 작아 맨 앞에 온다
  */
  const prio = (b: T) => b.displayOrder ?? 0;

  if (!nq) {
    return [...brands]
      .sort((a, b) => prio(b) - prio(a) || a.name.localeCompare(b.name))
      .map((brand) => ({ brand }));
  }

  const scored: { brand: T; r: number; alias?: string }[] = [];
  for (const brand of brands) {
    const m = rank(brand, nq);
    if (m) scored.push({ brand, r: m.rank, alias: m.alias });
  }

  return scored
    // ⚠️ 랭크가 **먼저**다 — 우선순위는 같은 랭크 안의 동점만 가른다 (D-285)
    .sort(
      (a, b) =>
        a.r - b.r ||
        prio(b.brand) - prio(a.brand) ||
        a.brand.name.localeCompare(b.brand.name),
    )
    .map(({ brand, alias }) => ({ brand, matchedAlias: alias }));
}
