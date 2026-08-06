import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

/**
 * Next 16에서 `middleware` 파일 규약은 `proxy`로 이름이 바뀌었다.
 * locale 판별·리다이렉트만 담당한다 (FR-06-A-01 ~ 03).
 *
 * `/admin`은 ko 단일(D-030)이므로 matcher에서 제외한다 — locale prefix가 붙지 않는다.
 */
export const proxy = createMiddleware(routing);

export const config = {
  matcher: [
    "/((?!admin|api|_next|_vercel|monitoring|.*\\.[\\w]+$).*)",
  ],
};
