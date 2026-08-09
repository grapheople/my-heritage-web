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
