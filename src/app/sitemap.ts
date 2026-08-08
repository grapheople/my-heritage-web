import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
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
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  const [codexIds, itemIds] = await Promise.all([
    allCodexIds(),
    // 색인 판정은 조회 계층 한 곳에서 한다 (D-093) — 여기서 다시 세지 않는다
    indexableItemIds(),
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

  // 마켓 목록 — 로케일별
  for (const locale of routing.locales) {
    entries.push({
      url: absolute(`/${locale}/market`),
      changeFrequency: "hourly",
      priority: 0.8,
      alternates: { languages: localeAlternates("/market") },
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
