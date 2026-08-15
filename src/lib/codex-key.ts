import { normalizeBrandToken } from "@/lib/brand-search";

/**
 * 매칭 키 → 도감 식별자 (D-013·D-014, `codex` FR-01-A-01·A-05).
 *
 * ## ⚠️ 복합 키가 이 파일의 존재 이유다
 * 6개 카테고리 중 **4개가 복합 키**다:
 *
 * | 카테고리 | 매칭 키 | 유형 |
 * |---|---|---|
 * | 시계 · 신발 | `uniqueId` | 단일 |
 * | 캠핑 · 데스크테리어 · 옷 | `brand` + `model` | 복합 |
 * | 자전거 | `brand` + `model` + `year` | 복합 |
 *
 * 예전 구현은 `attributeKeys[0]` 하나만 정규화했다. 그러면 캠핑에서
 * **Snow Peak 제품 전부가 도감 한 칸으로 뭉친다** — D-013 이 카테고리마다
 * 키를 다르게 정의한 이유가 정확히 그것을 막기 위해서였는데, 첫 키만 쓰면
 * 복합 키를 정의한 의미가 사라진다.
 *
 * ## 순서가 값의 일부다
 * `attributeKeys` 의 순서가 곧 정규화 순서다 (FR-01-A-05). 어드민이 A-03 에서
 * 순서를 바꾸면 **키가 달라진다** — 기존 도감과 매칭되지 않는다. 그래서
 * `MatchingKeyChangeLog` 로 변경 이력을 남긴다 (FR-01-B-04).
 */

/**
 * 구분자 — `` (ASCII Unit Separator).
 *
 * ⚠️ **구분자 선택이 정확성 문제다.** `|` 같은 인쇄 가능 문자를 쓰면
 * `["a|b", "c"]` 와 `["a", "b|c"]` 가 **같은 키**가 된다. 정규화는 공백·하이픈·
 * 언더스코어만 제거하므로(D-014) `|` 는 값 안에 그대로 살아남는다.
 *
 * US 는 키보드로 입력할 수 없고, 그럼에도 값에 섞여 들어오면 아래에서 제거한다.
 *
 * ⚠️ **PRD 초판은 `|` 로 적혀 있었다 — D-199 에서 문서를 정정했다.** 문서 쪽이
 * 결함이었고 구현이 옳았다. 되돌리지 말 것.
 */
const SEP = "";

export type MatchingKeyResult = {
  /** `CodexItem.normalizedKey` — 카테고리 단위 유일 (D-014) */
  normalizedKey: string;
  /** 사람이 읽는 원문. 단일 키면 그 값, 복합이면 공백으로 이었다 */
  raw: string;
  /** 순서 있는 (키, 원문 값) — 표시 명칭을 만들 때 쓴다 */
  parts: { key: string; value: string }[];
};

/**
 * 매칭 키를 만든다. **어느 키에도 값이 없으면 `null`** — 매칭할 근거가 없다.
 *
 * ⚠️ **일부만 비어도 키를 만든다.** `brand` 는 필수가 아니다 — 마스터에 없는
 * 브랜드는 요청 대기 상태로 비어 있을 수 있기 때문이다 (D-046). 그때 빈 칸을
 * 그대로 둔 키를 만든다. 빈 칸을 **건너뛰면** `["", "Tundra 45"]` 와
 * `["Tundra 45"]` 가 같은 키가 되어, 브랜드 있는 아이템과 없는 아이템이
 * 뭉친다. 자리를 비워두는 편이 안전하고, 정리는 어드민 병합(D-016)이 한다.
 *
 * @param attributeKeys A-03 에서 정한 순서 있는 키 목록
 * @param values 유저가 입력한 속성 값 (`brand` 는 브랜드 **이름**)
 */
export function buildMatchingKey(
  attributeKeys: readonly string[],
  values: Record<string, string | undefined>,
): MatchingKeyResult | null {
  if (attributeKeys.length === 0) return null;

  const parts = attributeKeys.map((k) => values[k]?.trim() ?? "");
  if (parts.every((p) => p.length === 0)) return null;

  const normalizedKey = parts
    // 값에 섞여 들어온 구분자는 제거한다 — 위 주석 참조
    .map((p) => normalizeBrandToken(p).split(SEP).join(""))
    .join(SEP);

  return {
    normalizedKey,
    raw: parts.filter(Boolean).join(" "),
    parts: attributeKeys.map((key, i) => ({ key, value: parts[i] })),
  };
}

/**
 * 자동 생성되는 도감의 표시 명칭 (FR-03-B-01).
 *
 * 브랜드 + 모델 + **나머지 매칭 키 값**이다.
 *
 * ## ⚠️ 나머지 키를 붙이지 않으면 이름이 겹친다
 * 자전거 매칭 키는 `brand + model + year` 다. 브랜드와 모델만 쓰면
 * 2021 년식과 2022 년식이 **둘 다 "Trek Domane SL 6"** 가 되어, 도감 목록에서
 * 같은 이름 두 칸이 나란히 뜬다. 키로는 갈라놓고 이름으로는 구분을 못 하는
 * 상태다 — 유저에게는 버그로 보인다.
 *
 * ## ⚠️ `uniqueId` 는 제외한다
 * 도감 상세가 고유번호를 **자기 필드로** 이미 보여준다. 이름에도 넣으면
 * `Rolex Submariner 126610LN` 처럼 같은 정보가 두 번 나온다.
 *
 * 어차피 어드민이 검증하며 정리할 값이므로 정교하게 만들지 않는다 (D-033).
 */
const NAME_EXCLUDED = new Set(["brand", "model", "uniqueId"]);

export function codexDisplayName(
  brandName: string | undefined,
  model: string | undefined,
  key: MatchingKeyResult,
): string {
  const extras = key.parts
    .filter((p) => !NAME_EXCLUDED.has(p.key) && p.value)
    .map((p) => p.value);
  const named = [brandName?.trim(), model?.trim(), ...extras]
    .filter(Boolean)
    .join(" ");
  return named || key.raw;
}

/**
 * 단일 키 카테고리에서만 `CodexItem.uniqueId` 를 채운다.
 *
 * 스키마 주석이 "매칭 키가 **단일 키인** 카테고리의 고유값"이라고 못박고 있고,
 * 도감 상세가 이 값을 `attr.uniqueId`(고유번호) 라벨로 보여준다. 복합 키의
 * 이어붙인 문자열을 넣으면 **"고유번호: Snow Peak 아메니티돔M"** 이 되어
 * 유저에게 거짓말이 된다.
 */
export function uniqueIdForCodex(
  attributeKeys: readonly string[],
  raw: string,
): string | null {
  return attributeKeys.length === 1 ? raw : null;
}
