import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { TopNav } from "@/components/layout/top-nav";

/**
 * 유저 셸 — 모바일 우선 + 데스크톱 대응 (D-077).
 *
 * | 폭 | 내비 | 콘텐츠 |
 * |---|---|---|
 * | ~1023px (`sm`·`md`) | 하단 탭바 | 유동 (전체 폭)          |
 * | 1024px~ (`lg`)      | 상단 네비 | `max-w-[1200px]` |
 *
 * `lg`에서 폭을 넓히는 것이 D-077에서 데스크톱 대응을 선택한 이유다 —
 * 진열을 5열로 늘려야 원칙 2("방은 목록이 아니라 공간")가 산다 (D-089).
 *
 * 어드민은 `(admin)` 그룹에서 별도 셸을 쓴다 (데스크톱 1440 · ko 단일 · D-030).
 */
export default function UserLayout({
  children,
}: LayoutProps<"/[locale]">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav />
      {/* sm·md 는 유동 폭이다. `max-w-screen-sm`(v3)은 Tailwind v4 에서 동작하지
          않아 캡이 걸리지 않았고, md(640~1023)에서 진열 4열을 쓰려면 애초에
          640 캡이 맞지 않는다 (D-089). lg 에서만 1200 으로 묶는다 */}
      <main className="mx-auto w-full flex-1 pb-2 lg:max-w-[1200px] lg:px-6 lg:pb-10">
        {children}
      </main>
      <BottomTabBar />
    </div>
  );
}
