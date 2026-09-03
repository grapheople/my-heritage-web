import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * 아이템 상태 배지.
 *
 * shadcn `Badge`를 쓰지 않고 별도로 만든 이유: 상태색(`--sale`·`--priv`·`--warn`)이
 * shadcn variant 체계 밖에 있고, 진열 카드 위에 절대 배치되므로 크기·여백이
 * 다르다. `components/ui/`를 수정하지 않는다는 규칙(DS-5)도 있다.
 *
 * ⚠️ **색만으로 상태를 전달하지 않는다** — 색 + 텍스트를 함께 낸다
 * (design-system.md §8). 명도 대비는 배지 배경 위 기준 전부 AA 통과.
 */
type Variant = "sale" | "private" | "unverified" | "archived";

const VARIANT: Record<Variant, { className: string; messageKey: string }> = {
  /** 판매중 — 유일하게 눈에 띄어야 하는 상태다. 마켓 유입 진입점 (D-046) */
  sale: {
    className: "bg-sale-bg text-sale ring-sale/30",
    messageKey: "item.status.onSale",
  },
  /**
   * 비공개 — **무채색이 의도다.** 상태이지 경고가 아니고, 색을 주면 눈에 띄어
   * D-083(권한 없는 아이템의 존재를 감춘다)의 취지와 어긋난다.
   * 본인 방에서만 노출된다 (FR-01-B-01).
   */
  private: {
    className: "bg-priv-bg text-priv ring-priv/25",
    messageKey: "item.visibility.private",
  },
  /**
   * 추억함에 보관됨 (D-296) — **무채색이다.** 비공개와 같은 이유로 색을 주지
   * 않는다. 보관은 경고가 아니라 상태이고, 눈에 띄게 만들면 진열에서 내린
   * 물건이 오히려 더 도드라진다.
   */
  archived: {
    className: "bg-priv-bg text-priv ring-priv/25",
    messageKey: "item.status.archived",
  },
  /** 미검증 도감 (D-033) */
  unverified: {
    className: "bg-warn-bg text-warn ring-warn/30",
    messageKey: "codex.unverified",
  },
};

export function StatusBadge({
  variant,
  className,
}: {
  variant: Variant;
  className?: string;
}) {
  const t = useTranslations();
  const { className: variantClass, messageKey } = VARIANT[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-bold whitespace-nowrap ring-1 ring-inset",
        variantClass,
        className,
      )}
    >
      {t(messageKey)}
    </span>
  );
}
