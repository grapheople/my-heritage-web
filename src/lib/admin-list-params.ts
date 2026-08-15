/**
 * 어드민 목록 쿼리 파라미터 파싱 (D-200).
 *
 * ## ⚠️ 왜 별도 모듈인가 — 서버·클라이언트 **양쪽이 쓴다**
 * 페이지(서버 컴포넌트)가 `searchParams` 를 파싱하고, 컨트롤(클라이언트
 * 컴포넌트)이 현재 값을 읽어 폼 상태를 맞춘다. **같은 규칙이어야** 화면에
 * 보이는 조건과 조회 조건이 갈리지 않는다.
 *
 * 초판은 이것을 `list-controls.tsx`(`"use client"`)에 뒀다가 **모든 페이지가
 * 500** 이 됐다 — `Attempted to call parseListParams() from the server but
 * parseListParams is on the client`. 클라이언트 모듈의 함수는 서버에서 부를 수
 * 없다.
 *
 * ⚠️ **`pnpm check` 도 `pnpm build` 도 이것을 잡지 못한다.** 두 페이지가 동적
 * 라우트(ƒ)라 빌드가 렌더하지 않기 때문이다. **실제로 요청해야** 드러난다.
 */

/** 페이지 크기 선택지 — PM 지정 */
export const PAGE_SIZES = [10, 50, 100] as const;

/** 기본값. 어드민 목록은 훑는 용도라 10 은 너무 잦게 넘긴다 */
export const DEFAULT_PAGE_SIZE = 50;

export type AdminListParams = {
  q: string;
  category: string;
  size: number;
  page: number;
};

export function parseListParams(
  sp: Record<string, string | string[] | undefined>,
): AdminListParams {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const size = Number(one("size"));
  const page = Number(one("page"));
  return {
    q: one("q").trim(),
    category: one("category"),
    // 임의의 size 를 허용하면 목록 전체를 한 번에 뽑는 주소가 만들어진다
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
    page: Number.isFinite(page) && page > 1 ? Math.floor(page) : 1,
  };
}
