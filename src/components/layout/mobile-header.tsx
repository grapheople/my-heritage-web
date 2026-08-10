"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { NAV_ITEMS } from "./nav-items";

/**
 * 모바일 상단 슬림 헤더 (D-159).
 *
 * | 위치 | 내용 |
 * |---|---|
 * | 좌측 | **뒤로가기** — 탭 루트가 아닐 때만 |
 * | 우측 | 알림함 (FR-08-A-02) — 로그인 유저에게만 (FR-08-A-07) |
 *
 * `lg` 에서는 없다 — 내비가 좌측 사이드바이고(D-143) 알림함은 그 안에 있다.
 *
 * ## ⚠️ 탭 루트에서는 뒤로가기를 내지 않는다
 * 하단 탭 4개의 목적지(`/` `/me` `/search` `/market`)는 **이동의 시작점**이다.
 * 거기서 뒤로가기를 누르면 직전 탭으로 튀는데, 탭 UI 에서는 탭을 다시 누르는
 * 것이 정상 경로다. **`NAV_ITEMS` 를 공유**해 판정한다 — 목록을 따로 두면
 * 메뉴가 늘 때 한쪽만 고쳐진다 (`nav-items.ts` 주석과 같은 이유).
 *
 * ⚠️ **완전 일치로 본다.** `startsWith` 로 보면 `/me/settings` · `/me/wear` ·
 * `/search?q=` 같은 하위 화면에서도 뒤로가기가 사라진다 — `isNavActive` 를
 * 쓰지 않는 이유다(그건 탭 활성 표시용이라 접두 일치가 맞다).
 *
 * ## ⚠️ 비어 있으면 렌더하지 않는다
 * 비로그인 + 탭 루트면 넣을 것이 하나도 없다. 그래도 렌더하면 **경계선만 있는
 * 빈 띠**가 남는다. 그래서 알림함을 `bell` **프롭으로 받는다** — 서버
 * 컴포넌트(`NotificationBell`)를 클라이언트 안에서 만들 수는 없지만, 만들어진
 * 엘리먼트를 넘겨받아 **있는지 없는지 판정**하는 것은 된다.
 */
const TAB_ROOTS: ReadonlySet<string> = new Set(NAV_ITEMS.map((i) => i.href));

export function MobileHeader({ bell }: { bell: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("nav");

  const showBack = !TAB_ROOTS.has(pathname);
  if (!showBack && !bell) return null;

  return (
    <div className="flex items-center justify-between border-b px-2 lg:hidden">
      {showBack ? (
        <button
          type="button"
          aria-label={t("back")}
          onClick={() => {
            /**
             * ⚠️ **되돌아갈 곳이 없을 수도 있다.** 검색 결과·공유 링크로 바로
             * 들어오면 히스토리가 이 화면 하나뿐이고, `back()` 은 **아무 일도
             * 하지 않는다** — 눌리지 않는 버튼처럼 보인다. 그때는 홈으로 보낸다.
             *
             * `history.length` 는 정확한 값이 아니지만(탭 전체 세션을 센다)
             * "새 탭에서 바로 열었다"를 가려내는 데는 충분하다. 잘못 판정해도
             * 홈으로 가므로 막히지 않는다.
             */
            if (window.history.length <= 1) router.replace("/");
            else router.back();
          }}
          className="-ml-1 inline-flex size-11 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
      ) : (
        // 뒤로가기가 없어도 알림함은 우측에 남아야 한다
        <span />
      )}
      {bell}
    </div>
  );
}
