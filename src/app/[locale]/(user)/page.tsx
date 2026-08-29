import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/domain/empty-state";
import { FeedCard } from "@/components/domain/feed-card";
import { FeedTabs } from "@/components/domain/feed-tabs";
import { FilterBar } from "@/components/domain/filter-bar";
import { Link } from "@/i18n/navigation";
import { absolute, localeAlternates } from "@/lib/site";
import { getViewer } from "@/lib/auth/viewer";
import { getFeed } from "@/lib/data/feed";
import { myCategoryKeys } from "@/lib/category-scope";

/**
 * S-01 NEW 피드 — 최초 진입 화면. 온보딩은 없다 (D-069).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 아이템 등록 시각 역순. 공개 전환·판매 복귀로 갱신하지 않는다 | D-070, FR-03-A-01·09 |
 * | **전체 탭**은 팔로우와 무관하게 전체 유저 | D-006, FR-03-A-02 |
 * | **팔로잉 탭**은 팔로우한 방만. 기본은 전체 탭 | **D-175** (OI-86) |
 * | 비공개 아이템·비공개 방은 제외 | D-019, FR-03-A-04 |
 * | 카드에 이미지·명칭·**카테고리**·소유자 방 이름 | FR-03-A-05 |
 * | 피드 범위 = **내 관심 카테고리 전체** (고르지 않는다) | **D-271·D-272** |
 * | 언어권 필터 한 줄 배치 | D-082, FR-03-B-06 |
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
/**
 * ⚠️ **카테고리별로 canonical 이 갈려야 색인된다** (D-142).
 *
 * 카테고리가 축이 된 이상(D-137) `?category=camping` 은 **다른 콘텐츠**다.
 * canonical 을 `/{locale}` 하나로 고정하면 검색엔진이 6개를 같은 페이지로
 * 보고 **기본 카테고리만 색인한다** — 캠핑을 찾는 사람이 서비스에 닿지 못한다.
 */
export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/[locale]">): Promise<Metadata> {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const category = typeof sp.category === "string" ? sp.category : undefined;
  const suffix = category ? `?category=${category}` : "";

  /*
    ⚠️ **팔로잉 탭은 색인하지 않는다** (D-175). 결과가 **조회 유저마다 다르므로**
    색인하면 크롤러가 본 누군가의 팔로잉 피드가 검색 결과가 된다. D-109 가 홈을
    열어준 근거("서비스가 검색에 안 나온다")는 **전체 탭에만** 해당한다.
    canonical 도 전체 탭을 가리켜, 탭이 홈의 중복 URL 이 되지 않게 한다.
  */
  const following = sp.tab === "following";
  return {
    robots: following
      ? { index: false, follow: true }
      : // 기본값이 noindex 이므로 여기서 명시적으로 켠다 (D-109)
        { index: true, follow: true },
    alternates: {
      // 자기 자신을 가리킨다 — sitemap 이 내는 URL 과 같아야 한다
      canonical: absolute(`/${locale}${suffix}`),
      languages: localeAlternates(category ? suffix : "/"),
    },
  };
}
export default async function FeedPage({
  searchParams,
}: PageProps<"/[locale]">) {
  const sp = await searchParams;
  const t = await getTranslations();

  const lang = typeof sp.lang === "string" ? sp.lang : "all";
  const viewer = await getViewer();
  // 기본은 전체다 — URL 에서 `?tab=all` 을 생략한다 (D-175)
  const tab = sp.tab === "following" ? "following" : "all";

  /*
    ⚠️ **축의 단위가 "내 관심사 집합" 이다** (D-271). D-137 의 축은 그대로지만
    하나를 고르지 않는다 — 시계와 캠핑을 함께 모으는 사람은 둘 다 본다.

    관심사가 없거나 비로그인이면 **전체**가 온다. 여기서 `[]` 를 받을 일은
    없다 — 받으면 D-069(관람자가 벽을 만남)와 D-109(크롤러가 빈 HTML)가
    동시에 깨진다
  */
  const categories = await myCategoryKeys();

  // 필터는 **조회 조건**이다 — 다 가져와서 걸러내면 비공개·차단이 응답에
  // 실린 뒤 화면에서만 사라진다 (D-083)
  const items = await getFeed(
    { categories, lang, following: tab === "following" },
    viewer,
  );

  return (
    <div>
      {/*
        ⚠️ **셀렉트 → 탭 순서**이고 **둘이 한 덩어리로 고정된다** (D-176).
        각자 `sticky` 를 걸면 탭만 스크롤에 밀려 올라간다 — 그래서 `FilterBar` 의
        sticky 를 걷고 여기서 감싼다. 경계선은 이 블록 하단에 한 줄만 둔다.
      */}
      <div className="sticky top-0 z-20 border-b bg-background">
        <FilterBar lang={lang} />
        {/* 전체 / 팔로잉 (D-175, OI-86 해소) */}
        <FeedTabs tab={tab} />
      </div>

      {/*
        ⚠️ **카테고리 선택 모달이 없다** (D-272). 축이 집합이 되면서 홈에서
        고를 것이 사라졌다 — 관심사가 없어도 전체를 보여주므로 벽이 아니다.
        하나를 고르는 화면은 도감뿐이고, 관심사 편집은 설정에서 한다
      */}
      {items.length === 0 ? (
        <EmptyState
          title={
            tab === "following"
              ? // 비로그인은 애초에 결과가 0 이다 — 로그인 유도가 먼저다 (D-175)
                viewer
                ? t("feed.emptyFollowing")
                : t("feed.followingLoginRequired")
              : t("empty.feed")
          }
          description={
            tab === "all" && lang !== "all" ? t("feed.emptyByLang") : undefined
          }
          action={
            /* 선택한 언어권에 아이템이 없으면 '전체'로 돌아갈 경로를 준다
               (FR-03-B-05) */
            tab === "following" && !viewer ? (
              <Link
                href="/login"
                className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-accent"
              >
                {t("auth.login")}
              </Link>
            ) : tab === "all" && lang !== "all" ? (
              /* 홈은 `?category=` 를 쓰지 않는다 (D-272) — 언어권만 걷어낸
                 주소가 곧 `/` 다 */
              <Link
                href="/"
                className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-accent"
              >
                {t("feed.showAllLangs")}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-7 px-4 py-6 lg:px-0">
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
