"use client";

import type { Route } from "next";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * 어드민 화면 15개 + 로컬 전용 1개 (myroom-service §6). ko 단일 — i18n 대상
 * 아님 (D-030). 하드코딩 문자열은 의도된 것이다. 어드민 UI 문구를
 * `messages/*.json` 에 넣지 않는다.
 *
 * ## ⚠️ A-02·A-03 은 메뉴에 없다 — A-01 상세로 흡수됐다 (D-246)
 * 동적 속성은 `/admin/categories/[key]/attributes`, 매칭 키는
 * `.../matching-key` 다. 옛 경로는 지우지 않고 목록으로 redirect 한다 (D-249).
 * **두 번호는 회수하되 재사용하지 않는다** (D-220).
 *
 * ⚠️ **A-15 는 로컬 전용 봇 시딩이 이미 쓰고 있다.** 새 화면은 A-16 부터다 —
 * 번호를 재사용하면 문서·화면·로그가 서로 다른 것을 가리킨다 (D-220).
 * A-17·A-18 은 운동 마스터·요청 큐다 (D-227~D-232).
 */
const SECTIONS = [
  {
    title: "운영",
    items: [
      { href: "/admin", label: "운영 대시보드", id: "A-13" },
      { href: "/admin/users", label: "유저 조회", id: "A-16" },
      { href: "/admin/reports", label: "신고 처리", id: "A-08" },
      { href: "/admin/sanctions", label: "유저·방 제재", id: "A-10" },
    ],
  },
  {
    title: "아이템",
    items: [
      { href: "/admin/categories", label: "카테고리 관리", id: "A-01" },
      { href: "/admin/brands", label: "브랜드 마스터", id: "A-11" },
      { href: "/admin/brands/requests", label: "브랜드 요청 큐", id: "A-12" },
      /*
        ⚠️ **운동은 아이템이 아니다** (D-227). 그래도 이 그룹에 두는 이유는
        어드민의 작업 맥락이 "아이템에 쓰이는 마스터 데이터"이기 때문이다 —
        브랜드 마스터와 성격이 같다. 도감 그룹에 두면 A-04 와 혼동된다
      */
      { href: "/admin/exercises", label: "운동 마스터", id: "A-17" },
      { href: "/admin/exercises/requests", label: "운동 요청 큐", id: "A-18" },
    ],
  },
  {
    title: "도감",
    items: [
      { href: "/admin/codex", label: "도감 전체 검색", id: "A-04" },
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
