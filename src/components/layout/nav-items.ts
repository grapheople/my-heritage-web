import { BookOpen, Compass, Home, Store } from "lucide-react";

/**
 * 메인 메뉴 4개 (myroom-service §1-1).
 *
 * **BottomTabBar(sm·md)와 TopNav(lg)가 이 배열을 공유한다.** 따로 두면 한쪽만
 * 고쳐져서 화면 폭에 따라 메뉴가 어긋난다. 순서·라벨은 폭과 무관하게 동일하고
 * **위치만 하단↔상단으로 바뀐다** (D-089).
 *
 * 라벨은 3개 언어로 번역한다 — 영문 고정 정책은 폐기됐다 (D-022, D-081).
 */
export const NAV_ITEMS = [
  { href: "/", labelKey: "new", Icon: Compass },
  { href: "/me", labelKey: "myRoom", Icon: Home },
  // ⚠️ 검색 탭을 **도감 탭으로 교체**했다 (D-160). 검색 기능은 없어지지 않고
  // `/codex` 안으로 들어갔다 — 아이템·방 검색은 FR-04-A-05·06·07 이 요구한다
  { href: "/codex", labelKey: "codex", Icon: BookOpen },
  { href: "/market", labelKey: "market", Icon: Store },
] as const;

/**
 * 현재 경로가 해당 메뉴에 속하는지.
 * 루트(`/`)는 완전 일치여야 한다 — 아니면 모든 경로에서 활성이 된다.
 */
export function isNavActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
