import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { NotificationBell } from "@/components/layout/notification-bell";
import { SideNav } from "@/components/layout/side-nav";
import { redirect } from "@/i18n/navigation";
import { getViewer, needsOnboarding } from "@/lib/auth/viewer";

/**
 * 유저 셸 — 모바일 우선 + 데스크톱 대응 (D-077).
 *
 * | 폭 | 내비 | 콘텐츠 |
 * |---|---|---|
 * | ~1023px (`sm`·`md`) | 하단 탭바 | 유동 (전체 폭)          |
 * | 1024px~ (`lg`)      | **좌측 사이드바** | `max-w-[1200px]` |
 *
 * ⚠️ **`lg` 내비를 상단 바에서 좌측으로 옮겼다** (D-143). 상단 바는 가로를
 * 먹고 세로를 남기는데, 진열은 세로로 길게 스크롤하는 화면이다 (D-068).
 * **사이드바는 1200px 컨테이너 밖에 둔다** — 안에 넣으면 진열이 좁아져
 * D-089 가 5열로 넓힌 이유가 무너진다.
 *
 * `lg`에서 폭을 넓히는 것이 D-077에서 데스크톱 대응을 선택한 이유다 —
 * 진열을 5열로 늘려야 원칙 2("방은 목록이 아니라 공간")가 산다 (D-089).
 *
 * 어드민은 `(admin)` 그룹에서 별도 셸을 쓴다 (데스크톱 1440 · ko 단일 · D-030).
 */
export default async function UserLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const viewer = await getViewer();
  const loggedIn = viewer !== null;

  // ⚠️ 방 이름이 없으면 **어느 화면도 열지 않는다** (FR-09-A-02). 여기서
  // 막지 않으면 빈 이름 방이 피드·검색·마켓 카드에 그대로 나간다 (D-123)
  if (viewer && (await needsOnboarding(viewer))) {
    const { locale } = await params;
    redirect({ href: "/onboarding", locale });
  }
  return (
    <div className="flex min-h-dvh lg:justify-center">
      <SideNav loggedIn={loggedIn}>
        <NotificationBell />
      </SideNav>

      <div className="flex min-w-0 flex-1 flex-col lg:max-w-[1200px]">
        {/* sm·md 알림 진입점 (FR-08-A-02). lg 는 사이드바 안에 있다.
            로그인 유저에게만 (FR-08-A-07) */}
        {loggedIn && (
          <div className="flex justify-end border-b px-2 lg:hidden">
            <NotificationBell />
          </div>
        )}
        {/* sm·md 는 유동 폭이다. `max-w-screen-sm`(v3)은 Tailwind v4 에서 동작하지
            않아 캡이 걸리지 않았고, md(640~1023)에서 진열 4열을 쓰려면 애초에
            640 캡이 맞지 않는다 (D-089). lg 에서만 1200 으로 묶는다 */}
        <main className="w-full flex-1 pb-2 lg:px-6 lg:pb-10">{children}</main>
      </div>

      <BottomTabBar />
    </div>
  );
}
