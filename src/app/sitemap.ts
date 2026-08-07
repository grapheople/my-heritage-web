import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { DEV_CODEX, DEV_ITEMS, isItemIndexable } from "@/lib/dev-fixture";
import { absolute, localeAlternates } from "@/lib/site";

/**
 * `/sitemap.xml` (D-078 · D-093).
 *
 * ## 들어가는 것만 넣는다
 *
 * | 대상 | 근거 |
 * |---|---|
 * | 도감 상세 | D-078 — 색인 대상 |
 * | 마켓 목록 | D-078 — 색인 대상 |
 * | **판매중 + 아이템 공개 + 방 공개** 아이템 상세 | D-093 — 조건부 |
 *
 * ## 들어가지 않는 것
 *
 * 방·일기·검색·NEW 피드·설정·알림함·어드민. `[locale]/layout.tsx` 의 기본
 * noindex 와 짝을 이룬다 — **sitemap 에 넣으면서 noindex 를 거는 것은 모순**이라
 * 두 곳의 목록이 항상 같아야 한다.
 *
 * ⚠️ **방을 넣지 않는 이유**: 도감 소유자 목록을 가린 것과 같은 이유다 (D-078).
 * 방이 색인되면 "이 사람이 무엇을 가지고 있는지"가 검색으로 드러나 D-031 에서
 * 수용한 절도 리스크가 검색엔진 규모로 커진다.
 *
 * 각 항목에 3개 로케일 `hreflang` 을 상호 선언한다 (D-091).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

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
  for (const c of DEV_CODEX) {
    for (const locale of routing.locales) {
      entries.push({
        url: absolute(`/${locale}/codex/${c.id}`),
        changeFrequency: "weekly",
        priority: 0.7,
        alternates: { languages: localeAlternates(`/codex/${c.id}`) },
      });
    }
  }

  // 판매중 공개 아이템만 (D-093). 판정은 isItemIndexable() 한 곳에서
  for (const item of Object.values(DEV_ITEMS)) {
    if (!isItemIndexable(item)) continue;
    for (const locale of routing.locales) {
      entries.push({
        url: absolute(`/${locale}/items/${item.id}`),
        changeFrequency: "daily",
        priority: 0.6,
        alternates: { languages: localeAlternates(`/items/${item.id}`) },
      });
    }
  }

  return entries;
}
