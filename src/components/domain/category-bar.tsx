"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { setCategory } from "@/lib/actions/category";

/**
 * 카테고리 전환 — NEW · 검색 · 마켓 공용 (D-137).
 *
 * ## ⚠️ `전체` 가 없다
 * 카테고리는 필터가 아니라 **축**이다. 항상 하나가 선택돼 있다 — 시계
 * 컬렉터가 캠핑 텐트를 스쳐 지나가지 않게 하는 것이 목적이다.
 *
 * 선택은 **URL 과 쿠키 양쪽**에 남긴다. URL 은 공유·뒤로가기·색인을 위해,
 * 쿠키는 다음 방문에 같은 카테고리로 들어오기 위해.
 */
export function CategoryBar({
  keys,
  active,
}: {
  keys: string[];
  active: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  function pick(key: string, params: URLSearchParams) {
    params.set("category", key);
    startTransition(async () => {
      await setCategory(key);
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="flex gap-2 overflow-x-auto border-b bg-background px-4 py-2.5 [scrollbar-width:none] lg:px-0 [&::-webkit-scrollbar]:hidden">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          aria-current={key === active ? "true" : undefined}
          onClick={() => {
            // 다른 조건(검색어·정렬·언어권)은 유지한다
            const p = new URLSearchParams(window.location.search);
            pick(key, p);
          }}
          className={
            key === active
              ? "shrink-0 rounded-full bg-foreground px-3.5 py-1.5 text-sm font-bold text-background"
              : "shrink-0 rounded-full border px-3.5 py-1.5 text-sm hover:bg-accent"
          }
        >
          {t(`category.${key}`)}
        </button>
      ))}
    </div>
  );
}
