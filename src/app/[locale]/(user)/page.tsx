import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/domain/empty-state";
import { FeedCard } from "@/components/domain/feed-card";
import { FilterBar } from "@/components/domain/filter-bar";
import { Link } from "@/i18n/navigation";
import { DEV_FEED } from "@/lib/dev-fixture";

/**
 * S-01 NEW 피드 — 최초 진입 화면. 온보딩은 없다 (D-069).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 아이템 등록 시각 역순. 공개 전환·판매 복귀로 갱신하지 않는다 | D-070, FR-03-A-01·09 |
 * | 팔로우와 무관하게 전체 유저 | D-006, FR-03-A-02 |
 * | 비공개 아이템·비공개 방은 제외 | D-019, FR-03-A-04 |
 * | 카드에 이미지·명칭·**카테고리**·소유자 방 이름 | FR-03-A-05 |
 * | 카테고리 + 언어권 필터를 **동시 적용**, 한 줄 배치 | D-082, FR-03-B-06 |
 * | 언어권 기본값 `전체` | D-027, FR-03-B-03 |
 * | 일기는 섞지 않는다 | D-006 |
 */
export default async function FeedPage({
  searchParams,
}: PageProps<"/[locale]">) {
  const sp = await searchParams;
  const t = await getTranslations();

  const category = typeof sp.category === "string" ? sp.category : undefined;
  const lang = typeof sp.lang === "string" ? sp.lang : "all";

  const items = DEV_FEED.filter(
    (i) =>
      (!category || i.categoryKey === `category.${category}`) &&
      (lang === "all" || i.lang === lang),
  );

  return (
    <div>
      <FilterBar category={category} lang={lang} />

      {items.length === 0 ? (
        <EmptyState
          title={t("empty.feed")}
          description={
            lang !== "all" ? t("feed.emptyByLang") : undefined
          }
          action={
            /* 선택한 언어권에 아이템이 없으면 '전체'로 돌아갈 경로를 준다
               (FR-03-B-05) */
            lang !== "all" ? (
              <Link
                href={category ? `/?category=${category}` : "/"}
                className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-accent"
              >
                {t("feed.showAllLangs")}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-5 px-4 py-5 md:grid-cols-3 lg:grid-cols-4 lg:px-0">
          {items.map((item) => (
            <li key={item.id}>
              <FeedCard item={item} />
            </li>
          ))}
          {/* 광고 슬롯 자리 (D-025). MVP 미노출 — 나중에 피드를 다시 짜지
              않으려고 레이아웃만 확보한다. N번째 카드 뒤에 카드 하나를 끼운다 */}
        </ul>
      )}
    </div>
  );
}
