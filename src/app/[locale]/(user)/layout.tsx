import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { MobileHeader } from "@/components/layout/mobile-header";
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
        {/*
          sm·md 상단 슬림 헤더 — **좌측 뒤로가기 + 우측 알림함** (D-159).
          lg 에는 없다(내비가 좌측 사이드바이고 알림함이 그 안에 있다).

          ⚠️ **`loggedIn` 으로 헤더 전체를 가리지 않는다.** 예전에는 알림함만
          있어서 그래도 됐지만, 뒤로가기는 **비로그인 유저에게도 필요**하다
          (아이템 상세·도감을 로그인 없이 본다). 비어 있을 때 렌더하지 않는
          판정은 `MobileHeader` 안에서 한다.

          알림함은 **엘리먼트로 넘긴다** — 서버 컴포넌트라 클라이언트 안에서
          만들 수 없다. 로그인 유저에게만 (FR-08-A-07)
        */}
        <MobileHeader bell={loggedIn ? <NotificationBell /> : null} />
        {/* 폭 캡은 위 컬럼(`CONTENT_MAX`)이 전 구간 걸고 있다 (D-156).
            ⚠️ `max-w-screen-sm`(v3)은 Tailwind v4 에서 동작하지 않는다 —
            폭 제한은 `max-w-[500px]` 처럼 명시값으로 쓴다 */}
        <main className="w-full flex-1 pb-2 lg:px-6 lg:pb-10">{children}</main>

        {/*
          ⚠️ **세로 컬럼 안에 있어야 한다** (D-145). 탭바는 `sticky bottom-0`
          이라 **세로 flow 안에서만** 하단에 붙는다. 바깥(가로 flex)에 두면
          콘텐츠 옆으로 밀려나 모바일 레이아웃이 깨진다 — D-143 으로 셸을
          `flex-col` 에서 가로 flex 로 바꿀 때 여기까지 옮기지 않아 실제로 깨졌다.
        */}
        <BottomTabBar />
      </div>

      {/*
        ⚠️ **우측 대칭 스페이서** (D-205). 사이드바(`w-56`)가 같은 flex 안에
        있어서 `justify-center` 는 **[사이드바 + 콘텐츠] 묶음**을 가운데 놓는다 —
        콘텐츠 자체는 사이드바 폭의 절반(112px)만큼 오른쪽으로 밀린다.
        1440px 에서 화면 중심은 720 인데 콘텐츠 중심이 832 였다.

        `design-system.md` 는 "콘텐츠 폭은 전 구간 중앙 정렬"이라고 적어두고
        있었으므로(D-156) 이것은 **의도 대비 결함**이지 새 결정이 아니다.

        ## 왜 `fixed` 가 아니라 스페이서인가
        사이드바를 `fixed` 로 빼면 콘텐츠는 진짜 중앙에 오지만 **겹칠 수 있다** —
        1024px 에서 콘텐츠는 262px 부터 시작하므로 지금(224px)은 아슬하게
        피하고, 사이드바를 조금만 넓히면 조용히 겹친다. 스페이서는 flow 안에
        있어 **겹침이 구조적으로 불가능**하고 `sticky top-0` 도 그대로 둔다.
        폭 합은 224+500+224=948 로 1024 에 들어간다.

        사이드바는 여전히 500px 컨테이너 **밖**이다 (D-143·D-156 근거 유지).
      */}
      <div className="hidden w-56 shrink-0 lg:block" aria-hidden />
    </div>
  );
}
