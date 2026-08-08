import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { AdminNav } from "@/components/layout/admin-nav";
import { getAdmin } from "@/lib/auth/admin";
import "../../globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * 어드민 루트 레이아웃 — 두 번째 root layout이다.
 *
 * 어드민 UI 언어는 **ko 단일** (D-030)이므로 `/[locale]` prefix를 붙이지 않는다.
 * `src/proxy.ts` matcher에서 `/admin`을 제외했기 때문에 locale 리다이렉트도 걸리지 않는다.
 * 단, 어드민이 **입력하는 유저 노출 필드**(속성 라벨·enum·도감 설명·alias·단위)는
 * ko/ja/en 3개 입력 필드를 제공해야 한다 (D-030, D-010).
 *
 * 프로토타입 기준 뷰포트: 데스크톱 1440×900.
 *
 * ## ⚠️ 인가 가드 (D-102)
 * `AdminUser` 에 있고 `active` 인 계정만 들어온다. **비인가는 404 다** —
 * 403 을 내면 `/admin` 이 존재한다는 사실이 드러난다. 어드민 화면을 유저에게
 * 알릴 이유가 없다 (D-083 과 같은 기준).
 *
 * 레이아웃에서 막는 이유: 화면마다 걸면 새 화면을 추가할 때 빠뜨린다.
 * D-096 이 그렇게 새서 나온 결정이다.
 */
/**
 * ⚠️ **동적 렌더를 명시한다.**
 *
 * 어드민은 인가가 필요해서 정적일 수 없다. 그런데 `getAdmin()` 이 요청 스코프
 * 밖에서 `auth()` 가 던지는 것을 **try/catch 로 삼키므로**(스크립트 검증용,
 * D-102) Next 는 "이 라우트는 동적"이라는 신호를 받지 못한다.
 *
 * 그 결과 빌드가 어드민 페이지를 **정적 생성하려 시도하고, 페이지 컴포넌트의
 * DB 쿼리에서 매달린다** — DB 에 못 닿는 네트워크에서 실제로 빌드가 멈췄다.
 *
 * 즉 이 한 줄은 성능 설정이 아니라 **빌드가 DB 에 묶이지 않게 하는 장치**다.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "나의 방 어드민",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: LayoutProps<"/admin">) {
  // 여기가 유일한 관문이다. 화면별로 다시 확인하지 않는다
  if (!(await getAdmin())) notFound();

  return (
    <html
      lang="ko"
      dir="ltr"
      className={`${geist.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <div className="flex min-h-dvh">
          <AdminNav />
          <main className="min-w-0 flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
