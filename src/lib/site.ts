import { routing } from "@/i18n/routing";

/**
 * 절대 URL 생성 — sitemap·robots·hreflang 에서 쓴다.
 * 상대 경로로는 sitemap 을 만들 수 없다.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002"
).replace(/\/$/, "");

export function absolute(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * 3개 로케일 상호 선언 (hreflang).
 *
 * 색인 대상 페이지에만 붙인다 — 도감 상세·마켓·판매중 공개 아이템 (D-078·D-093).
 * `localePrefix: "always"` 라 `en` 도 프리픽스가 붙는다 (D-091).
 */
export function localeAlternates(
  pathWithoutLocale: string,
): Record<string, string> {
  return Object.fromEntries(
    routing.locales.map((l) => [l, absolute(`/${l}${pathWithoutLocale}`)]),
  );
}
