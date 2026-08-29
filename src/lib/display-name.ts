/**
 * **언어별 표시명 고르기** — 브랜드·도감 공용 (D-276).
 *
 * ## ⚠️ 이 파일은 **순수하다 — 서버 모듈을 import 하지 않는다**
 * 브랜드 선택·등록 폼이 **클라이언트 컴포넌트**라 여기를 직접 부른다. 한 줄만
 * 서버 모듈을 끌어와도 `prisma` → `pg` 가 브라우저 번들에 딸려 들어가
 * `Can't resolve 'util/types'` 로 **빌드가 깨진다.**
 *
 * ⚠️ **타입 검사로는 안 잡힌다.** `tsc` 는 통과하고 번들러만 터진다 — 그래서
 * 규칙을 여기 적어둔다. 뷰어를 읽어야 하는 `viewerLangOrder()` 는
 * `lib/language-scope.ts`(서버 전용)에 있다.
 *
 * ## ⚠️ `aliases` 와 역할이 다르다
 * | | 무엇 | 값의 모양 |
 * |---|---|---|
 * | `aliases` | **검색** 토큰 | 정규화됨 — `G-SHOCK` 의 en 은 `gshock` |
 * | `nameKo/Ja/En` | **표시** 명칭 | 사람이 읽는 그대로 — `지샥` · `G-SHOCK` |
 *
 * alias 를 화면에 띄우면 **이름이 깨진다.** 실제로 `Orient Star` 의 en alias 는
 * `orient star`(소문자)이고 `G-SHOCK` 은 `gshock` 이다. 둘을 섞지 않는다.
 *
 * ## 우선순위 — **영어 > 한국어 > 일본어**
 * 관심 언어권(D-274)에 든 언어만 후보이고, 그 안에서 이 순서로 고른다.
 *
 * ```
 * 관심 언어권 [ko, ja]  → ko 우선 (en 은 관심사 밖)
 * 관심 언어권 [ko]      → ko
 * 관심 언어권 없음/비로그인 → 전체가 후보 → en
 * ```
 *
 * ## ⚠️ **원문으로 떨어지는 것이 정상이다**
 * 도감 1,113건 중 **1,002건에 alias 조차 없다.** 언어별 명칭은 더 드물다 —
 * 도감은 유저 등록으로 자동 생성되므로(D-005) 3개 언어를 요구할 수 없고,
 * 그것이 **D-009 선택지 B 가 탈락한 이유**다. 빈 이름을 띄우느니 원문이 낫다.
 *
 * ⚠️ **절대 빈 문자열을 내지 않는다.** 호출부가 "이름 없음"을 그리게 되면
 * 유저는 데이터가 깨진 것으로 읽는다 — `myCategoryKeys`·`myLanguages` 가
 * 빈 배열을 내지 않는 것과 같은 이유다 (D-271·D-274).
 */
export type LocalizedNames = {
  nameKo?: string | null;
  nameJa?: string | null;
  nameEn?: string | null;
};

/** 표시 우선순위 — **이 순서가 정책이다** (D-276). 바꾸면 결정을 새로 남긴다 */
const DISPLAY_PRIORITY = ["en", "ko", "ja"] as const;

const FIELD = {
  ko: "nameKo",
  ja: "nameJa",
  en: "nameEn",
} as const satisfies Record<string, keyof LocalizedNames>;

/**
 * 관심 언어권을 표시 우선순위로 정렬한다.
 *
 * ⚠️ `languages` 는 **비어 올 수 없다** (`myLanguages()` 보장). 그래도 비면
 * 전체 순위를 쓴다 — 후보가 없어 원문만 나오는 상태를 만들지 않는다
 */
export function displayLangOrder(languages: string[]): string[] {
  const order = DISPLAY_PRIORITY.filter((l) => languages.includes(l));
  return order.length > 0 ? [...order] : [...DISPLAY_PRIORITY];
}

/**
 * 언어별 명칭 중 하나를 고른다. 없으면 `fallback`(원문).
 *
 * @param fallback `Brand.name` 또는 `CodexItem.displayName` — **항상 채워져 있다**
 */
export function pickDisplayName(
  row: LocalizedNames,
  fallback: string,
  languages: string[],
): string {
  for (const lang of displayLangOrder(languages)) {
    const v = row[FIELD[lang as keyof typeof FIELD]]?.trim();
    if (v) return v;
  }
  return fallback;
}
