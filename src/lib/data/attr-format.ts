import type { Locale } from "@/i18n/routing";
import { pickLabel } from "@/lib/data/label";

/**
 * 속성값 → **표시 문자열** (D-312 에서 `data/item.ts` 에서 뽑아 공용화).
 *
 * ## ⚠️ 왜 공용 모듈인가
 * 같은 값이 **아이템 상세**와 **도감 스펙** 두 곳에 뜬다. 규칙이 두 벌이면
 * 같은 저장값이 화면마다 다르게 보인다 — `lightlyUsed` 가 한쪽은 "약간 사용",
 * 다른 쪽은 영어 키로 나오는 식이다 (D-155 가 정확히 그 사고였다).
 */

/** 속성값 Json → 표시 문자열. multiselect 는 배열, boolean 은 진짜 boolean 이다 */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/**
 * `select`·`multiselect` 값을 **로케일 라벨로** 바꾼다 (D-155).
 *
 * ## ⚠️ 저장값은 옵션 **키**다 — 그대로 내면 영어가 보인다
 * `condition` 은 `lightlyUsed`, `accessories` 는 `["box","manual"]` 로 저장된다.
 * D-135 에서 **속성 라벨**을 DB 에서 읽도록 고쳤지만 **옵션 라벨은 빠뜨렸다** —
 * `AttributeOption.labelKo/Ja/En` 이 존재하는데 아무도 읽지 않았다.
 *
 * ## ⚠️ 키를 못 찾으면 키를 그대로 낸다
 * 옵션이 비활성화됐거나(`active: false`) 삭제된 뒤에도 **값은 보존된다**
 * (D-036, M-09). 빈 문자열로 만들면 값이 있는데 화면에서 사라진다.
 */
export function optionLabel(
  locale: Locale,
  options: { key: string; labelKo: string; labelJa: string; labelEn: string }[],
  raw: unknown,
): string {
  const one = (k: string) => {
    const hit = options.find((o) => o.key === k);
    return hit
      ? pickLabel(locale, { ko: hit.labelKo, ja: hit.labelJa, en: hit.labelEn }) || k
      : k;
  };
  // 다중선택은 배열로 저장된다 — 표시 순서는 저장 순서를 따른다
  if (Array.isArray(raw)) return raw.map((v) => one(String(v))).join(", ");
  return one(String(raw));
}

/**
 * 값 + 단위 (D-038, FR-02-A-08).
 *
 * ⚠️ **`number` 에만 단위를 붙인다.** 선택형·날짜에 붙이면 "밀기 kg" 같은 값이
 * 나온다. 값이 비면 단위도 내지 않는다 — 단위만 남은 칸이 생긴다
 */
export function withUnit(
  locale: Locale,
  def: { type: string; unitKo: string | null; unitJa: string | null; unitEn: string | null },
  text: string,
): string {
  if (!text) return "";
  if (def.type !== "number") return text;
  const unit = pickLabel(locale, { ko: def.unitKo, ja: def.unitJa, en: def.unitEn });
  return unit ? `${text} ${unit}` : text;
}
