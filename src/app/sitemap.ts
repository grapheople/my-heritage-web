import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { activeCategoryKeys } from "@/lib/category-scope";
import { allCodexIds } from "@/lib/data/codex";
import { indexableItemIds } from "@/lib/data/item";
import { absolute, localeAlternates } from "@/lib/site";

/**
 * `/sitemap.xml` (D-078 · D-093).
 *
 * ## 들어가는 것만 넣는다
 *
 * | 대상 | 근거 |
 * |---|---|
 * | **홈 (NEW 피드)** | **D-109** — D-078 을 부분 폐기하고 열었다 |
 * | 도감 상세 | D-078 — 색인 대상 |
 * | 마켓 목록 | D-078 — 색인 대상 |
 * | **판매중 + 아이템 공개 + 방 공개** 아이템 상세 | D-093 — 조건부 |
 *
 * ## 들어가지 않는 것
 *
 * 방·일기·검색·설정·알림함·어드민. `[locale]/layout.tsx` 의 기본
 * noindex 와 짝을 이룬다 — **sitemap 에 넣으면서 noindex 를 거는 것은 모순**이라
 * 두 곳의 목록이 항상 같아야 한다.
 *
 * ⚠️ **방을 넣지 않는 이유**: 도감 소유자 목록을 가린 것과 같은 이유다 (D-078).
 * 방이 색인되면 "이 사람이 무엇을 가지고 있는지"가 검색으로 드러나 D-031 에서
 * 수용한 절도 리스크가 검색엔진 규모로 커진다.
 *
 * 각 항목에 3개 로케일 `hreflang` 을 상호 선언한다 (D-091).
 */
/**
 * ⚠️ **정적으로 굳으면 안 된다.**
 *
 * sitemap 은 DB 를 읽는다(도감 id · 색인 대상 아이템 id). 기본값대로 빌드
 * 시점에 프리렌더되면 **새 도감·새 매물이 재배포까지 sitemap 에 안 들어간다.**
 * 도감은 유저 등록으로 계속 생기므로(D-015) 그 사이 색인이 밀린다.
 *
 * ## ⚠️ `revalidate` 만으로는 부족했다
 * `revalidate` 는 **빌드 시점에 한 번 생성한 뒤** 재검증한다. 즉 **빌드가
 * 여전히 DB 연결을 요구한다** — DB 에 못 닿으면 배포가 실패한다. 처음에
 * "재검증으로 두면 빌드가 DB 에서 분리된다"고 적었는데 **틀렸다.**
 *
 * `force-dynamic` 이라야 빌드가 DB 에서 완전히 분리된다. sitemap 은 크롤러만
 * 읽으므로 요청당 렌더 비용이 문제되지 않는다.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  const [codexIds, itemIds, categoryKeys] = await Promise.all([
    allCodexIds(),
    // 색인 판정은 조회 계층 한 곳에서 한다 (D-093) — 여기서 다시 세지 않는다
    indexableItemIds(),
    // 활성 카테고리 — 어드민이 늘리면 sitemap 도 따라 늘어난다
    activeCategoryKeys(),
  ]);

  // 홈 — 색인 대상이다 (D-109). 브랜드 검색 유입의 진입점이라 우선순위가 가장 높다
  for (const locale of routing.locales) {
    entries.push({
      url: absolute(`/${locale}`),
      changeFrequency: "hourly",
      priority: 1,
      alternates: { languages: localeAlternates("/") },
    });
  }

  /*
    카테고리별 홈 — 카테고리가 **축**이 된 이상 6개가 각각 색인돼야 한다
    (D-137·D-142). 넣지 않으면 **기본 카테고리 하나만** 색인되고, 캠핑을
    찾는 사람은 서비스에 닿지 못한다.

    ⚠️ **`/{locale}` 과 기본 카테고리 URL 은 같은 화면이다.** 브랜드 검색용
    진입점(`/{locale}`)을 남기려면 감수해야 하는 중복이다 — 검색엔진이 둘 중
    하나를 고른다. 트래픽이 쌓인 뒤 다시 볼 문제로 남긴다 (D-142)
  */
  for (const locale of routing.locales) {
    for (const key of categoryKeys) {
      entries.push({
        url: absolute(`/${locale}?category=${key}`),
        changeFrequency: "hourly",
        priority: 0.9,
        alternates: { languages: localeAlternates(`?category=${key}`) },
      });
    }
  }

  // 마켓 목록 — 로케일별
  for (const locale of routing.locales) {
    entries.push({
      url: absolute(`/${locale}/market`),
      changeFrequency: "hourly",
      priority: 0.8,
      alternates: { languages: localeAlternates("/market") },
    });
  }

  /*
    도감 목록 — 로케일별 (D-160). 마켓 목록과 같은 성격의 탭 랜딩이다.
    ⚠️ **크롤러가 도감 상세로 들어가는 경로**이기도 하다 — 도감이 이 서비스의
    색인 자산인데(D-098) 상세만 올리면 내부 링크로 닿는 길이 없다.
    카테고리별로 갈라 넣지 않는다: 기본 카테고리 하나만 색인되는 문제(D-142)는
    홈에만 해당하고, 여기는 목록이 최근 추가순이라 카테고리를 나눠도 같은
    도감 상세로 수렴한다.
  */
  for (const locale of routing.locales) {
    entries.push({
      url: absolute(`/${locale}/codex`),
      changeFrequency: "daily",
      priority: 0.8,
      alternates: { languages: localeAlternates("/codex") },
    });
  }

  // 도감 상세 — 콘텐츠가 거의 안 바뀐다 (ISR revalidate 1h)
  for (const codexId of codexIds) {
    for (const locale of routing.locales) {
      entries.push({
        url: absolute(`/${locale}/codex/${codexId}`),
        changeFrequency: "weekly",
        priority: 0.7,
        alternates: { languages: localeAlternates(`/codex/${codexId}`) },
      });
    }
  }

  // 판매중 공개 아이템만 (D-093). 판정은 isItemIndexable() 한 곳에서
  for (const itemId of itemIds) {
    for (const locale of routing.locales) {
      entries.push({
        url: absolute(`/${locale}/items/${itemId}`),
        changeFrequency: "daily",
        priority: 0.6,
        alternates: { languages: localeAlternates(`/items/${itemId}`) },
      });
    }
  }

  return entries;
}
