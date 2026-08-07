"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ItemGrid } from "./item-grid";
import type { ItemThumbData } from "./item-thumb";

/**
 * "떠난 아이템" 섹션 — 판매완료 아이템 (D-023).
 *
 * - 진열 **맨 하단**에 단일 섹션으로 둔다 (FR-01-A-09)
 * - **기본 접힘.** 펼치면 그레이스케일 (D-086, FR-01-A-13·14)
 * - 카테고리 진열 및 **보유 아이템 수 집계에서 제외**된다 (FR-01-A-07).
 *   개수는 이 헤더에만 표기한다
 * - 0건이면 호출부에서 렌더하지 않는다 (FR-01-A-08)
 *
 * 카테고리 안에 섞으면 부피 착시가 생겨 원칙 2가 왜곡되고, 완전히 숨기면
 * D-023의 "소유 이력이 남는다"가 사라진다. 접어두는 것이 그 사이다.
 */
export function GoneSection({ items }: { items: ItemThumbData[] }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations();

  return (
    <section className="mt-5 border-t bg-muted/40 px-4 py-5 lg:rounded-lg lg:border lg:px-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-baseline gap-2 text-left"
      >
        <h2 className="text-base font-bold text-muted-foreground">
          {t("myRoom.leftItems")}
        </h2>
        <span className="text-sm font-semibold text-muted-foreground">
          {formatNumber(items.length)}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "ml-auto size-4 self-center text-muted-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="mt-3">
          <ItemGrid items={items} parted capped={false} />
        </div>
      )}
    </section>
  );
}
