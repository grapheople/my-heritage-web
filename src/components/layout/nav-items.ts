import { BookOpen, Compass, Footprints, Home, Store } from "lucide-react";

/**
 * 메인 메뉴 5개 (myroom-service §1-1 + 출근길).
 *
 * ## ⚠️ 기획에는 아직 4개로 적혀 있다
 * `출근길`(S-미정)은 코드에 먼저 들어왔다. IA 는 **정책 층이라 기획이 SoT** 이므로
 * (CLAUDE.md SoT 3층) `myroom-service/02-planning-spec.md` §1-1 의 메뉴 목록과
 * 화면 목록에 이 항목을 추가하고 D-번호를 받아야 한다. 그때까지 이 배열이 기획을
 * 앞서 있는 상태다 — 되돌릴 수 있게 이 주석을 남긴다.
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
  /**
   * 집앞 신호등 잔여시간 (`/api/signal`).
   *
   * 아이콘이 신호등이 아닌 이유: lucide 에 `TrafficLight` 가 없다. 발자국이
   * "출근길"이라는 이름과도 맞는다.
   */
  { href: "/commute", labelKey: "commute", Icon: Footprints },
] as const;

/**
 * 현재 경로가 해당 메뉴에 속하는지.
 * 루트(`/`)는 완전 일치여야 한다 — 아니면 모든 경로에서 활성이 된다.
 */
export function isNavActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
