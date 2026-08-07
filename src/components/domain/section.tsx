import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { DISPLAY_CAP, ItemGrid } from "./item-grid";
import type { ItemThumbData } from "./item-thumb";

/**
 * 카테고리 진열 섹션 (D-068 — 세로 스크롤. 탭·아코디언이 아니다).
 *
 * - 헤더에 **총 개수**를 낸다. 컬렉션의 부피가 보여야 한다 (원칙 2, FR-01-A-02)
 * - 섹션 순서는 **아이템 개수 내림차순**이다 (D-075) — 호출부 책임
 * - 정렬은 등록순 고정. 유저가 바꿀 수 없다 (D-070)
 * - 아이템이 없는 카테고리는 호출부에서 숨긴다 (FR-01-A-04)
 *
 * "더 보기"는 **상한을 넘을 때만** 낸다 (FR-01-A-17). `lg`는 15개까지 보이므로
 * 13~15개 구간에서는 모바일에만 보여야 한다.
 */
export function Section({
  categoryKey,
  totalCount,
  items,
  moreHref,
}: {
  /** i18n key — `category.watch` 등 */
  categoryKey: string;
  totalCount: number;
  items: ItemThumbData[];
  /** 카테고리 전체 화면(S-23) 경로 */
  moreHref: string;
}) {
  const t = useTranslations();

  const overSmMd = totalCount > DISPLAY_CAP.smMd;
  const overLg = totalCount > DISPLAY_CAP.lg;

  return (
    <section className="px-4 py-5 lg:px-0 lg:py-6">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-lg font-bold tracking-tight">{t(categoryKey)}</h2>
        <span className="text-sm font-semibold text-muted-foreground">
          {formatNumber(totalCount)}
        </span>
      </div>

      <ItemGrid items={items} />

      {overSmMd && (
        <Link
          href={moreHref}
          className={
            // 13~15개면 lg 에서는 전부 보이므로 "더 보기"를 감춘다
            overLg
              ? "mt-3 block rounded-lg border py-3 text-center text-sm font-semibold hover:bg-accent"
              : "mt-3 block rounded-lg border py-3 text-center text-sm font-semibold hover:bg-accent lg:hidden"
          }
        >
          {t("display.more")}{" "}
          <span className="font-semibold text-muted-foreground">
            {formatNumber(totalCount)}
          </span>
        </Link>
      )}
    </section>
  );
}
