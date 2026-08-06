import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AdminNav } from "@/components/layout/admin-nav";
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
 */
export const metadata: Metadata = {
  title: "나의 방 어드민",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: LayoutProps<"/admin">) {
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
