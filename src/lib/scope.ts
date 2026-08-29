/**
 * 카탈로그 스코프 (D-254).
 *
 * ## ⚠️ 이 규칙은 DB 의 생성 컬럼과 **같아야 한다**
 * `CodexItem`·`CodexMatchKey`·`BrandScope` 의 `scopeId` 는
 * `GENERATED ALWAYS AS (COALESCE("subtypeId", "categoryId")) STORED` 다.
 * 여기서 다르게 계산하면 **쓴 곳과 찾는 곳이 갈린다** — 앱이 만든 도감을
 * 앱이 다시 찾지 못한다.
 *
 * 값을 **쓰지는 않는다.** DB 가 채우므로 조회·필터에만 쓴다.
 */

/**
 * 배타적 스코프 — **도감**이 쓴다.
 *
 * 종류가 있으면 종류가, 없으면 카테고리가 그 도감의 이름 공간이다.
 * 정확히 하나여야 한다 — 둘이면 같은 제품이 두 도감으로 갈린다 (D-207).
 */
export function scopeIdOf(input: {
  categoryId: string;
  subtypeId?: string | null;
}): string {
  return input.subtypeId ?? input.categoryId;
}

/**
 * 포함적 스코프 — **브랜드**가 쓴다 (D-255).
 *
 * 카테고리 공통 연결 ∪ 그 종류 전용 연결. 도감과 방향이 반대인 이유는
 * 하나는 유일성 판정이고 하나는 선택지 목록이기 때문이다 — 선택지를 좁히면
 * 유저가 막힌다.
 *
 * ⚠️ **`null` 을 배열에 넣지 않는다.** `scopeId IN ('cat1', NULL)` 은 SQL 에서
 * `NULL` 항목이 절대 매칭되지 않는다. 종류가 없으면 원소 1개로 낸다.
 */
export function scopeIdsFor(input: {
  categoryId: string;
  subtypeId?: string | null;
}): string[] {
  return input.subtypeId ? [input.categoryId, input.subtypeId] : [input.categoryId];
}

/**
 * 브랜드 조회용 `where.scopes` 절 (D-255) — **키 기준**.
 *
 * `scopeId IN (...)` 대신 관계로 쓴다. id 를 먼저 조회할 필요가 없고,
 * `null` 을 배열에 넣는 실수가 원천적으로 불가능하다.
 *
 * ⚠️ 종류를 안 넘기면 **카테고리 공통만** 나온다 — 종전 동작과 같다.
 */
export function brandScopesWhere(input: {
  categoryKey: string;
  subtypeKey?: string | null;
}) {
  return {
    some: {
      OR: [
        // 카테고리 공통 연결
        { category: { key: input.categoryKey }, subtypeId: null },
        // 이 종류 전용 연결
        ...(input.subtypeKey
          ? [{ subtype: { key: input.subtypeKey, category: { key: input.categoryKey } } }]
          : []),
      ],
    },
  };
}
