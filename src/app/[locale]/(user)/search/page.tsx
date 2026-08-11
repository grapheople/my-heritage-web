import { permanentRedirect } from "next/navigation";
import { getPathname } from "@/i18n/navigation";

/**
 * 옛 검색 화면 → **도감 탭으로 영구 이동** (D-160).
 *
 * ## ⚠️ 라우트를 지우지 않고 리다이렉트한다
 * 하단 탭 3번이 검색 → 도감으로 바뀌면서 화면이 `/codex` 로 옮겨졌다. 그냥
 * 지우면 **북마크·공유 링크·검색엔진 색인이 전부 404** 가 된다. 검색 결과
 * URL 은 공유되는 종류의 주소다 — 그래서 애초에 상태를 쿼리에 싣는다
 * (`filter-bar.tsx` 주석과 같은 이유).
 *
 * ## ⚠️ 307 이 아니라 **308(영구)** 이다
 * `redirect()` 는 307(임시)을 낸다. 이 이동은 되돌릴 계획이 없으므로 검색엔진이
 * **옛 URL 의 평가를 새 URL 로 넘기도록** 영구로 알린다. 임시로 두면 옛 주소가
 * 색인에 계속 남는다. locale 접두는 `getPathname` 이 붙인다.
 *
 * ⚠️ **`q`·`category` 만 넘긴다.** `?q=` 를 잃으면 링크를 눌러 온 사람이 빈
 * 화면을 본다. `tab` 은 **버린다** — D-165 에서 탭이 없어졌으므로 옛 링크의
 * `?tab=items` 는 가리킬 화면이 없다. 도감 결과로 보내는 것이 유일한 선택이다.
 */
export default async function LegacySearchPage({
  params,
  searchParams,
}: PageProps<"/[locale]/search">) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);

  const query: Record<string, string> = {};
  for (const key of ["q", "category"] as const) {
    const v = sp[key];
    if (typeof v === "string" && v) query[key] = v;
  }

  const target = getPathname({
    href:
      Object.keys(query).length > 0 ? { pathname: "/codex", query } : "/codex",
    locale,
  });

  /**
   * ⚠️ **`typedRoutes` 는 리터럴 라우트만 받는다.** 여기 경로는 locale 접두와
   * 쿼리를 런타임에 붙여 만든 문자열이라 그 타입을 통과하지 못한다.
   * `getPathname` 의 `href` 쪽에서 이미 타입 검사를 받았으므로(`/codex` 는
   * 실재하는 라우트다) 캐스팅을 **이 한 줄에 가둔다.**
   */
  permanentRedirect(target as Parameters<typeof permanentRedirect>[0]);
}
