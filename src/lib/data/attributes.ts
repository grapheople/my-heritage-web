import { pickLabel as pick } from "@/lib/data/label";
import { pickCategoryAttrLabel } from "@/lib/data/label";
import { prisma } from "@/lib/prisma";

/**
 * 카테고리별 동적 속성 (item-catalog F-02, D-038).
 *
 * ## ⚠️ 라벨은 i18n 리소스가 아니라 **DB** 에서 온다
 * `AttributeDefinition` 이 `labelKo`·`labelJa`·`labelEn` 3개를 들고 있다
 * (D-010). 어드민이 카테고리 전용 속성을 추가하면 그 라벨은 코드에 없으므로
 * **메시지 파일로는 표현할 수 없다.** 그래서 서버에서 로케일로 해석해 내린다.
 *
 * 선택지(`AttributeOption`)도 같다 — **enum 번역 누락이 가장 흔한 지점**이라
 * 3개 언어를 DB 가 강제한다 (`policies/i18n` §3).
 *
 * 폴백은 `요청 언어 → en → ko` (D-012).
 */
export type Locale = "ko" | "ja" | "en";

export type AttrOption = { key: string; label: string };

export type AttrDef = {
  key: string;
  /** **해석된 라벨.** 화면에서 다시 번역하지 않는다 */
  label: string;
  type:
    | "text" | "textarea" | "number" | "select"
    | "multiselect" | "date" | "boolean" | "url";
  required: boolean;
  /** `number` 전용. 단위도 3개 언어다 (D-038, FR-02-A-08) */
  unit?: string;
  /** `select`·`multiselect` 전용 */
  options?: AttrOption[];
  /** 이 속성이 도감 매칭 키인가 (D-013) */
  matchingKey?: boolean;
  /** 브랜드는 자유 텍스트가 아니라 마스터 select 다 (D-043) */
  brandSelect?: boolean;
};


/**
 * 등록·수정 폼이 그릴 속성 목록.
 *
 * ⚠️ **활성 속성만, 지정된 순서로** (D-036, FR-05-A-02). 비활성 속성은 값이
 * 보존되지만 폼에는 나오지 않는다 (M-09).
 *
 * ⚠️ 결과가 비면 **어드민이 A-02 에서 조합을 구성하지 않은 것이다** (D-097).
 * 폼은 그 상태를 빈 화면이 아니라 안내로 내야 한다.
 */
/**
 * 속성 행 select — **공통 조회와 제품군 조회가 같은 모양을 써야 한다** (D-207).
 * 따로 쓰면 한쪽에만 필드가 빠져 폼에서 그 항목만 라벨·단위가 사라진다.
 */
const ATTR_SELECT = {
  required: true,
  // 카테고리별 라벨 override (D-168)
  labelKo: true, labelJa: true, labelEn: true,
  attributeDefinition: {
    select: {
      key: true,
      type: true,
      labelKo: true, labelJa: true, labelEn: true,
      unitKo: true, unitJa: true, unitEn: true,
      options: {
        where: { active: true },
        orderBy: { displayOrder: "asc" as const },
        select: {
          key: true,
          labelKo: true, labelJa: true, labelEn: true,
        },
      },
    },
  },
} as const;

export async function getCategoryAttributes(
  categoryKey: string,
  locale: Locale,
  /**
   * D-207 — 하위 제품군 `key`. 주면 **공통 + 그 제품군 전용**을 합쳐 낸다.
   * 안 주면 공통만 — 제품군이 없는 6개 카테고리가 그 경우이고 기존과 같다
   */
  subtypeKey?: string,
): Promise<AttrDef[]> {
  const category = await prisma.category.findUnique({
    where: { key: categoryKey },
    select: {
      id: true,
      matchingKey: { select: { attributeKeys: true } },
      subtypes: {
        where: subtypeKey ? { key: subtypeKey, active: true } : { id: "__none__" },
        select: { id: true, matchingKey: { select: { attributeKeys: true } } },
      },
      attributes: {
        where: { active: true },
        orderBy: { displayOrder: "asc" },
        select: ATTR_SELECT,
      },
    },
  });
  if (!category) return [];

  /*
    D-207 — 제품군 전용 속성을 따로 읽어 **공통 뒤에 붙인다.**
    `category.attributes` 는 `categoryId` 로만 걸리므로(카테고리 XOR 제품군)
    제품군 행은 거기 안 들어온다.

    ⚠️ **공통이 먼저다.** 브랜드·모델명이 위에 오고 제품군 전용(수용 인원·
    내한 온도)이 뒤따라야, 카테고리를 바꿔도 폼 상단이 같아 유저가 매번
    다시 읽지 않는다
  */
  const subtype = category.subtypes[0] ?? null;
  const subtypeAttrs = subtype
    ? await prisma.categoryAttribute.findMany({
        where: { subtypeId: subtype.id, active: true },
        orderBy: { displayOrder: "asc" },
        select: ATTR_SELECT,
      })
    : [];

  // 제품군 매칭 키가 있으면 그것이 이긴다 — 합치지 않는다 (`lib/subtype.ts` 참조)
  const matchingKeys = new Set(
    subtype?.matchingKey?.attributeKeys ?? category.matchingKey?.attributeKeys ?? [],
  );

  return [...category.attributes, ...subtypeAttrs].map((ca) => {
    const d = ca.attributeDefinition;
    const unit = pick(locale, { ko: d.unitKo, ja: d.unitJa, en: d.unitEn });
    return {
      key: d.key,
      label: pickCategoryAttrLabel(locale, ca),
      type: d.type,
      required: ca.required,
      unit: unit || undefined,
      options:
        d.options.length > 0
          ? d.options.map((o) => ({
              key: o.key,
              label: pick(locale, { ko: o.labelKo, ja: o.labelJa, en: o.labelEn }),
            }))
          : undefined,
      matchingKey: matchingKeys.has(d.key),
      // 브랜드만 마스터 참조다 (D-043). 나머지 select 는 AttributeOption 을 쓴다
      brandSelect: d.key === "brand",
    };
  });
}

/**
 * 속성값 표시용 라벨 해석 — 저장된 값은 **선택지 key** 이므로 그대로 보여주면
 * `cond.light` 같은 내부 값이 화면에 나온다.
 *
 * ⚠️ 값 자체(유저가 입력한 `Rolex`·`명동 백화점`)는 **번역 대상이 아니다.**
 * 번역되는 것은 **선택지 라벨**뿐이다 (`policies/i18n` §1-2·§3).
 */
export async function optionLabels(
  locale: Locale,
): Promise<Map<string, string>> {
  const options = await prisma.attributeOption.findMany({
    select: {
      key: true,
      labelKo: true, labelJa: true, labelEn: true,
      attributeDefinition: { select: { key: true } },
    },
  });
  return new Map(
    options.map((o) => [
      `${o.attributeDefinition.key}:${o.key}`,
      pick(locale, { ko: o.labelKo, ja: o.labelJa, en: o.labelEn }),
    ]),
  );
}
