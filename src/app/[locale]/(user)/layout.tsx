import { BottomTabBar } from "@/components/layout/bottom-tab-bar";

/**
 * 유저 셸 — 모바일 우선. 하단 탭 4개가 모든 화면에 고정된다 (D-069).
 * 어드민은 `(admin)` 그룹에서 별도 셸을 쓴다 (데스크톱 1440 · ko 단일 · D-030).
 */
export default function UserLayout({
  children,
}: LayoutProps<"/[locale]">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-screen-sm flex-1 pb-2">
        {children}
      </main>
      <BottomTabBar />
    </div>
  );
}
