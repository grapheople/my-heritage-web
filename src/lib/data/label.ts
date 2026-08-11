import type { Locale } from "@/i18n/routing";

/**
 * 3개 언어 라벨에서 하나 고르기 — 요청 언어 → en → ko (D-012).
 *
 * ## ⚠️ 속성 라벨은 **메시지 파일이 아니라 DB** 에서 온다
 * `AttributeDefinition` 이 `labelKo/Ja/En` 을 갖는 이유가 이것이다 (D-010).
 * 속성은 **어드민이 코드 배포 없이 추가한다** — 메시지 파일에 키를 넣는
 * 방식으로는 새로 만든 속성의 이름을 영원히 낼 수 없다.
 *
 * 실제로 `attr.color` 를 못 찾아 아이템 상세가 터진 적이 있다 (D-135).
 */
export function pickLabel(
  locale: Locale,
  v: { ko: string | null; ja: string | null; en: string | null },
): string {
  return v[locale] || v.en || v.ko || "";
}

/** `AttributeDefinition` 의 `labelKo/Ja/En` 을 그대로 받는 형태 */
export function pickAttrLabel(
  locale: Locale,
  d: { key: string; labelKo: string; labelJa: string; labelEn: string },
): string {
  return pickLabel(locale, { ko: d.labelKo, ja: d.labelJa, en: d.labelEn }) || d.key;
}

/**
 * **카테고리별 라벨 override** 를 우선한다 (D-168, OI-83 해소).
 *
 * ## ⚠️ 라벨이 키 단위 전역이라 생긴 문제
 * `AttributeDefinition.labelKo` 는 **모든 카테고리가 공유**한다. 그래서 운동
 * 카테고리의 `model` 이 등록 폼에 **"모델명"** 으로 떴다 — 종목명이어야 한다.
 * 아이템 명칭이 `Item.model` 컬럼 파생이라(D-073·D-118) 다른 키로 바꿀 수도 없다.
 *
 * `CategoryAttribute` 에 override 3개를 두고, **있으면 그것이 이긴다.**
 *
 * ⚠️ **로케일별로 섞지 않는다.** override 의 ko 만 채워두고 ja 를 비우면
 * "ko 는 운동명, ja 는 モデル名"이 된다 — 한 속성이 언어에 따라 다른 것을
 * 가리키는 셈이다. **override 가 하나라도 있으면 override 안에서만 고른다.**
 */
export function pickCategoryAttrLabel(
  locale: Locale,
  ca: {
    labelKo: string | null;
    labelJa: string | null;
    labelEn: string | null;
    attributeDefinition: {
      key: string;
      labelKo: string;
      labelJa: string;
      labelEn: string;
    };
  },
): string {
  const hasOverride = Boolean(ca.labelKo || ca.labelJa || ca.labelEn);
  if (hasOverride) {
    const picked = pickLabel(locale, {
      ko: ca.labelKo,
      ja: ca.labelJa,
      en: ca.labelEn,
    });
    if (picked) return picked;
  }
  return pickAttrLabel(locale, ca.attributeDefinition);
}
