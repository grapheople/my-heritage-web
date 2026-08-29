"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * 카테고리 상세 탭바 (D-246).
 *
 * ⚠️ **개요 탭만 정확 일치로 판정한다.** `startsWith` 로 하면 `/watch/codex`
 * 에서 개요도 함께 활성으로 보인다.
 */
const TABS = [
  { seg: "", label: "개요" },
  { seg: "subtypes", label: "하위 종류" },
  { seg: "attributes", label: "동적 속성" },
  { seg: "matching-key", label: "매칭 키" },
  { seg: "brands", label: "연결 브랜드" },
  { seg: "codex", label: "도감" },
] as const;

export function CategoryTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/admin/categories/${slug}`;

  return (
    <nav className="mt-4 flex gap-1 border-b">
      {TABS.map((t) => {
        const href = t.seg ? `${base}/${t.seg}` : base;
        const activeTab = t.seg ? pathname.startsWith(href) : pathname === base;
        return (
          <Link
            key={t.seg}
            // typedRoutes 는 런타임 조립 href 를 좁히지 못한다 (admin-nav 와 같은 처리)
            href={href as Route}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              activeTab
                ? "border-foreground font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
