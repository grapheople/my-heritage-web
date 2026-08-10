import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { NotificationBell } from "@/components/layout/notification-bell";
import { SideNav } from "@/components/layout/side-nav";
import { redirect } from "@/i18n/navigation";
import { getViewer, needsOnboarding } from "@/lib/auth/viewer";

/**
 * 유저 셸 — **단일 폭 컬럼** (D-156).
 *
 * | 폭 | 내비 | 콘텐츠 |
 * |---|---|---|
 * | ~1023px (`sm`·`md`) | 하단 탭바 | 유동, **최대 500px** |
 * | 1024px~ (`lg`)      | **좌측 사이드바** | **500px 고정** |
 *
 * ## ⚠️ 콘텐츠 폭을 500px 로 고정했다 (D-156) — D-089 를 되돌린다
 * D-089 는 데스크톱에서 진열을 **5열로 넓혀** 원칙 2("방은 목록이 아니라
 * 공간")를 살리려 했고, D-143 은 그 열 수를 지키려고 **사이드바를 컨테이너
 * 밖에** 뒀다. 500px 고정은 그 방향을 뒤집는다 — 어느 폭에서도 열 수가
 * 늘지 않으므로 **모바일 레이아웃이 유일한 레이아웃**이다.
 *
 * ⚠️ **컨테이너만 좁히면 안 된다.** 그리드가 `lg:grid-cols-5` 처럼 **뷰포트
 * breakpoint** 기반이라, 폭만 500 으로 묶으면 데스크톱에서 5열이 그대로 걸려
 * 타일이 85px 로 깨진다. 진열·피드·마켓의 데스크톱 열 수 상향을 함께 제거했다.
 *
 * 사이드바는 여전히 컨테이너 **밖**이다 — 안에 넣으면 500px 를 나눠 쓴다.
 *
 * 어드민은 `(admin)` 그룹에서 별도 셸을 쓴다 (데스크톱 1440 · ko 단일 · D-030).
 */
/** 콘텐츠 컬럼 상한 (D-156). 좌측 사이드바는 여기에 포함되지 않는다 */
const CONTENT_MAX = "max-w-[500px]";
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
    // ⚠️ `justify-center` 를 `lg` 로 한정하지 않는다 (D-156). 500px 캡이 모든
    // 폭에 걸리므로, 태블릿(640~1023)에서도 가운데 정렬해야 한쪽으로 붙지 않는다
    <div className="flex min-h-dvh justify-center">
      <SideNav loggedIn={loggedIn}>
        <NotificationBell />
      </SideNav>

      <div className={`flex min-w-0 flex-1 flex-col ${CONTENT_MAX}`}>
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

        {/*
          ⚠️ **세로 컬럼 안에 있어야 한다** (D-145). 탭바는 `sticky bottom-0`
          이라 **세로 flow 안에서만** 하단에 붙는다. 바깥(가로 flex)에 두면
          콘텐츠 옆으로 밀려나 모바일 레이아웃이 깨진다 — D-143 으로 셸을
          `flex-col` 에서 가로 flex 로 바꿀 때 여기까지 옮기지 않아 실제로 깨졌다.
        */}
        <BottomTabBar />
      </div>
    </div>
  );
}
