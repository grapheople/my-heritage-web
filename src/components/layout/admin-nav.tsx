"use client";

import type { Route } from "next";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * 어드민 화면 14개 (myroom-service §6). ko 단일 — i18n 대상 아님 (D-030).
 * 하드코딩 문자열은 의도된 것이다. 어드민 UI 문구를 messages/*.json에 넣지 않는다.
 */
const SECTIONS = [
  {
    title: "운영",
    items: [
      { href: "/admin", label: "운영 대시보드", id: "A-13" },
      { href: "/admin/reports", label: "신고 처리", id: "A-08" },
      { href: "/admin/sanctions", label: "유저·방 제재", id: "A-10" },
    ],
  },
  {
    title: "아이템",
    items: [
      { href: "/admin/categories", label: "카테고리 관리", id: "A-01" },
      { href: "/admin/attributes", label: "동적 속성 관리", id: "A-02" },
      { href: "/admin/brands", label: "브랜드 마스터", id: "A-11" },
      { href: "/admin/brands/requests", label: "브랜드 요청 큐", id: "A-12" },
    ],
  },
  {
    title: "도감",
    items: [
      { href: "/admin/matching-keys", label: "매칭 키 정의", id: "A-03" },
      { href: "/admin/codex", label: "도감 목록", id: "A-04" },
      { href: "/admin/codex/verification", label: "검증 큐", id: "A-05" },
      { href: "/admin/codex/merge", label: "병합 큐", id: "A-06" },
      { href: "/admin/codex/aliases", label: "alias 관리", id: "A-07" },
    ],
  },
  {
    title: "레벨",
    items: [{ href: "/admin/levels", label: "레벨 테이블", id: "A-09" }],
  },
  {
    title: "시스템",
    // ⚠️ 권한 상승 경로다. 잠금 방지·이력이 함께 있다 (D-104)
    items: [{ href: "/admin/admins", label: "어드민 계정", id: "A-14" }],
  },
] as const;

/**
 * ⚠️ **로컬 전용 메뉴** (D-146). 프로덕션에서는 그리지 않는다 — 화면 자체가
 * 404 지만, 링크가 보이면 누군가 누르고 "왜 안 되냐"를 묻게 된다.
 *
 * 클라이언트 컴포넌트라 `NODE_ENV` 를 직접 본다. 이 값은 **빌드 시점에
 * 인라인**되므로 프로덕션 번들에는 조건이 `false` 로 굳어 들어간다.
 */
const LOCAL_SECTION =
  process.env.NODE_ENV === "development"
    ? {
        title: "로컬 전용",
        items: [
          { href: "/admin/bots", label: "봇 콘텐츠 시딩", id: "A-15" },
        ],
      }
    : null;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="w-60 shrink-0 border-r bg-muted/30 p-4">
      <p className="px-2 pb-4 text-sm font-semibold">Zroom 어드민</p>
      <div className="space-y-5">
        {[...SECTIONS, ...(LOCAL_SECTION ? [LOCAL_SECTION] : [])].map((section) => (
          <div key={section.title}>
            <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
              {section.title}
            </p>
            <ul>
              {section.items.map((item) => (
                <li key={item.href}>
                  <Link
                    // typedRoutes 는 유니온 href 를 좁히지 못한다.
                    // 값 자체는 `as const` 로 라우트 리터럴이 보장된다
                    href={item.href as Route}
                    aria-current={pathname === item.href ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between rounded-md px-2 py-1.5 text-sm",
                      pathname === item.href
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50",
                    )}
                  >
                    <span>{item.label}</span>
                    <span className="font-mono text-[10px] opacity-60">
                      {item.id}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
