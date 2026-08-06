import type { Locale } from "@/i18n/routing";

/**
 * 날짜·숫자·통화 포맷.
 *
 * SoT: policies/i18n/policy-handoff.md §5
 * 여기 규칙을 컴포넌트에서 직접 다시 만들지 않는다 — 언어별로 어긋난다.
 */

/** 판매자 지정 통화 (D-011). 환산하지 않는다 */
export type CurrencyCode = "KRW" | "JPY" | "USD";

const CURRENCY: Record<
  CurrencyCode,
  { symbol: string; fractionDigits: 0 | 2 }
> = {
  KRW: { symbol: "₩", fractionDigits: 0 },
  JPY: { symbol: "¥", fractionDigits: 0 },
  USD: { symbol: "$", fractionDigits: 2 },
};

/**
 * `₩1,200,000` / `¥180,000` / `$1,200.00`
 *
 * 천 단위 구분자는 **3개 언어 모두 콤마**이고 심볼도 고정이므로 locale에 의존하지 않는다.
 * `Intl.NumberFormat(locale, {style:'currency'})`은 ja-JP에서 전각 `￥`를 내므로 쓰지 않는다.
 */
export function formatPrice(
  amount: number | string,
  currency: CurrencyCode,
): string {
  const { symbol, fractionDigits } = CURRENCY[currency];
  const value = typeof amount === "string" ? Number(amount) : amount;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
  return `${symbol}${formatted}`;
}

/** 천 단위 콤마. 3개 언어 공통 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

/**
 * ko `2026.08.04` / ja `2026年8月4日` / en `Aug 4, 2026`
 *
 * @param timeZone 표시 기준 타임존. 유저 설정(User.timezone)을 넘긴다 (D-056)
 */
export function formatDate(
  date: Date,
  locale: Locale,
  timeZone = "UTC",
): string {
  if (locale === "ko") {
    // ko-KR 기본값은 `2026. 8. 4.` 라서 직접 조립한다
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}.${get("month")}.${get("day")}`;
  }

  if (locale === "ja") {
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone,
      dateStyle: "long",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

/**
 * 소유 기간 — 타인에게는 구매일 대신 이것만 노출한다 (FR-01-B-03).
 * 결과는 `item.ownedFor` 메시지에 넣어 언어별 복수형 규칙을 라이브러리에 맡긴다
 * (policies/i18n §5 — 문자열 결합으로 만들지 않는다).
 */
export function ownershipDuration(
  purchaseDate: Date,
  now = new Date(),
): { years: number; months: number } {
  let months =
    (now.getUTCFullYear() - purchaseDate.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - purchaseDate.getUTCMonth());
  if (now.getUTCDate() < purchaseDate.getUTCDate()) months -= 1;
  months = Math.max(0, months);
  return { years: Math.floor(months / 12), months: months % 12 };
}

/**
 * 경험치 1일 1회 판정용 날짜 키 (`YYYY-MM-DD`).
 *
 * "오늘"의 경계는 **유저 타임존 기준**이다 (D-056). 운영 지표는 UTC(`createdAt`)를
 * 쓰므로 두 기준이 공존한다 — 섞지 말 것.
 */
export function userLocalDate(timeZone: string, at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
