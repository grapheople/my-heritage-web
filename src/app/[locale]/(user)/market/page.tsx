import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/domain/empty-state";
import { MarketCard } from "@/components/domain/market-card";
import { MarketControls } from "@/components/domain/market-controls";
import { getViewer } from "@/lib/auth/viewer";
import { getMarketListings } from "@/lib/data/market";
import { resolveCategory } from "@/lib/category-scope";
import { CategoryBar } from "@/components/domain/category-bar";
import { localeAlternates } from "@/lib/site";

/**
 * S-09 마켓 — 판매중 아이템 목록.
 *
 * ⚠️ **색인 대상이다** (D-078). `[locale]/layout.tsx`가 기본 noindex 이므로
 * 여기서 명시적으로 켠다. 색인 대상은 도감·마켓·판매중 공개 아이템뿐이다.
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 판매중 + 공개만 | D-019, FR-02-A-01·02 |
 * | 기본 정렬 = 판매 전환 시각 역순 | D-048, FR-02-A-03 |
 * | 가격은 판매자 통화 그대로. **환산 없음** | D-011, FR-02-A-05 |
 * | 필터는 카테고리 + 통화 **2개만**. 언어권 없음 | D-049, FR-02-B-01·02 |
 * | 가격순은 단일 통화 선택 시에만. 비활성 이유를 안내 | D-048, FR-02-C-01·02 |
 * | 광고 삽입 지점 확보 (MVP 미노출) | D-025, FR-02-A-07 |
 */
export const metadata: Metadata = {
  robots: { index: true, follow: true },
  // 3개 로케일 상호 선언 (D-091). 색인 대상에만 붙인다
  alternates: { languages: localeAlternates("/market") },
};

export default async function MarketPage({
  searchParams,
}: PageProps<"/[locale]/market">) {
  const sp = await searchParams;
  const t = await getTranslations();

  // ⚠️ 카테고리는 항상 하나다 (D-137)
  const scope = await resolveCategory(
    typeof sp.category === "string" ? sp.category : undefined,
  );
  const category = scope.key;
  const currency = typeof sp.currency === "string" ? sp.currency : undefined;
  // 통화가 없으면 가격순을 쓸 수 없다 (FR-02-C-01)
  const sort = sp.sort === "price" && currency ? "price" : "recent";

  // 정렬·필터 모두 조회 계층에서 끝난다. 가격순은 단일 통화일 때만
  // 적용된다 — 환율을 쓰지 않기 때문 (D-011, FR-02-C-01)
  const listings = await getMarketListings(
    { category, currency, sort },
    await getViewer(),
  );

  return (
    <div>
      <CategoryBar keys={scope.keys} active={category} />
      <MarketControls currency={currency} sort={sort} />

      {listings.length === 0 ? (
        <EmptyState title={t("empty.market")} />
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-5 px-4 py-5 md:grid-cols-3 lg:grid-cols-4 lg:px-0">
          {listings.map((l) => (
            <li key={l.id}>
              <MarketCard listing={l} />
            </li>
          ))}
          {/* 광고 슬롯 자리 (D-025). MVP 미노출 — 레이아웃만 확보 */}
        </ul>
      )}
    </div>
  );
}
