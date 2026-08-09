import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/domain/empty-state";
import { FeedCard } from "@/components/domain/feed-card";
import { FilterBar } from "@/components/domain/filter-bar";
import { Link } from "@/i18n/navigation";
import { localeAlternates } from "@/lib/site";
import { getViewer } from "@/lib/auth/viewer";
import { getFeed } from "@/lib/data/feed";
import { resolveCategory } from "@/lib/category-scope";
import { CategoryGate } from "@/components/domain/category-gate";

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
 *
 * ## ⚠️ 색인 대상이다 (D-109 — D-078 을 부분 폐기)
 * D-078 은 홈을 `noindex` 로 뒀다. 그 결과 **`Zroom` 으로 검색해도 서비스가
 * 안 나왔고** 유입이 도감·마켓 딥링크뿐이었다. D-109 로 열었다.
 *
 * **무엇이 색인되는지 알고 있어야 한다**: 아이템 명칭 · 카테고리 · **소유자
 * 방 이름** · 대표 사진. 즉 "누가 무엇을 가졌는가"가 피드 단위로 색인된다.
 * 방 상세(S-02·S-03)와 일기는 여전히 `noindex` 지만, **방만 막고 피드를 여는
 * 것은 절반만 막는 것**이다 — PM 이 유입을 우선해 수용했다 (D-109).
 *
 * ⚠️ **D-031 절도 리스크가 다시 커진다.** 카테고리별 비공개 비율을 이 결정
 * 이후 반드시 관측한다 — 비율이 오르면 유저가 위험을 감지한 신호다.
 *
 * 유저 통제 수단은 그대로다 — 아이템별 비공개(D-019)·방 비공개로 피드에서 빠진다.
 */
export const metadata: Metadata = {
  // 기본값이 noindex 이므로 여기서 명시적으로 켠다 (D-109)
  robots: { index: true, follow: true },
  alternates: { languages: localeAlternates("/") },
};
export default async function FeedPage({
  searchParams,
}: PageProps<"/[locale]">) {
  const sp = await searchParams;
  const t = await getTranslations();

  const lang = typeof sp.lang === "string" ? sp.lang : "all";
  const viewer = await getViewer();

  // ⚠️ **카테고리는 필터가 아니라 축이다** (D-137). 항상 하나가 정해져 있고
  // 피드는 그 안에서만 보여준다. `전체` 는 없다
  const scope = await resolveCategory(
    typeof sp.category === "string" ? sp.category : undefined,
  );
  const category = scope.key;

  // 필터는 **조회 조건**이다 — 다 가져와서 걸러내면 비공개·차단이 응답에
  // 실린 뒤 화면에서만 사라진다 (D-083)
  const items = await getFeed({ category, lang }, viewer);

  return (
    <div>
      <FilterBar lang={lang} categoryKeys={scope.keys} category={category} />

      {/* ⚠️ 콘텐츠 **위에** 덮는다. 대체하지 않는다 — 크롤러는 피드를 읽어야
          하고(D-109) 관람자는 벽부터 만나면 안 된다(D-069) */}
      {!scope.chosen && <CategoryGate keys={scope.keys} />}

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
