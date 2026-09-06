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

/** `Locale` → BCP-47. `Intl` 은 지역까지 있어야 요일 표기가 맞는다 */
const BCP47: Record<Locale, string> = { ko: "ko-KR", ja: "ja-JP", en: "en-US" };

/**
 * 날짜 타일 — **사진 없는 일기 카드**의 썸네일 자리에 쓴다 (D-308).
 *
 * | | ko | ja | en |
 * |---|---|---|---|
 * | `head` | `2026. 9` | `2026年9月` | `Sep 2026` |
 * | `day` | `6` | `6` | `6` |
 * | `weekday` | `토` | `土` | `Sat` |
 *
 * ## ⚠️ `YYYY-MM-DD` 를 **UTC 로** 읽는다
 * `DiaryEntry.createdAt` 은 `toISOString().slice(0, 10)` 으로 만든 UTC 날짜다.
 * 이것을 `new Date("2026-09-06")` 로 파싱하면 UTC 자정이 되고, 브라우저
 * 타임존이 UTC 서쪽이면 **하루 밀려 요일이 어긋난다.** 날짜를 그려놓고 요일만
 * 틀리면 유저는 어느 쪽이 맞는지 알 수 없다.
 *
 * ⚠️ 요일은 **직접 배열로 갖지 않는다.** `["일","월",…]` 을 코드에 두면 언어가
 * 늘 때마다 배열이 늘고, `Intl` 이 이미 3개 언어를 다 안다 (D-010 과 같은 태도).
 */
export function dateTileParts(
  ymd: string,
  locale: Locale,
): { head: string; day: string; weekday: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  // 형식이 어긋나면 원문을 그대로 낸다 — 화면이 깨지는 것보다 낫다
  if (!y || !m || !d) return { head: ymd, day: "", weekday: "" };

  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = new Intl.DateTimeFormat(BCP47[locale], {
    timeZone: "UTC",
    weekday: "short",
  }).format(date);

  const head =
    locale === "ko"
      ? `${y}. ${m}`
      : locale === "ja"
        ? `${y}年${m}月`
        : new Intl.DateTimeFormat("en-US", {
            timeZone: "UTC",
            year: "numeric",
            month: "short",
          }).format(date);

  return { head, day: String(d), weekday };
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
