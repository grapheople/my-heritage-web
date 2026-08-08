import { routing } from "@/i18n/routing";

/**
 * 절대 URL 생성 — sitemap·robots·hreflang 에서 쓴다.
 * 상대 경로로는 sitemap 을 만들 수 없다.
 */
/**
 * 사이트 절대 URL.
 *
 * | 우선순위 | 값 | 언제 |
 * |:---:|---|---|
 * | 1 | `NEXT_PUBLIC_SITE_URL` | **프로덕션 — 실제 도메인.** 반드시 설정한다 |
 * | 2 | `VERCEL_PROJECT_PRODUCTION_URL` | 도메인 연결 전 `*.vercel.app` |
 * | 3 | `VERCEL_URL` | preview 배포 (배포마다 다르다) |
 * | 4 | `localhost:3002` | 로컬 |
 *
 * ## ⚠️ sitemap·hreflang 은 **한 도메인만** 가리켜야 한다
 * preview 배포가 프로덕션 URL 을 sitemap 에 쓰면 색인이 엉키고, 반대로
 * 프로덕션이 preview URL 을 쓰면 검색엔진이 사라질 주소를 색인한다.
 * 그래서 프로덕션에서는 **`NEXT_PUBLIC_SITE_URL` 을 반드시 설정한다** —
 * 자동 감지에 맡기지 않는다.
 *
 * `NEXT_PUBLIC_*` 은 **빌드 타임에 인라인**된다. 값을 바꾸면 재배포가 필요하다.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit;

  // Vercel 은 프로토콜 없이 호스트만 준다
  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;

  return "http://localhost:3002";
}

export const SITE_URL = resolveSiteUrl().replace(/\/$/, "");

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
  // ⚠️ 홈(`"/"`)이면 `/ko/` 가 되어 sitemap 의 `/ko` 와 어긋난다.
  // 같은 화면이 두 URL 로 보이면 검색엔진이 중복으로 취급한다 (D-109)
  const path = pathWithoutLocale === "/" ? "" : pathWithoutLocale;
  return Object.fromEntries(
    routing.locales.map((l) => [l, absolute(`/${l}${path}`)]),
  );
}
