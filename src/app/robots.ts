import type { MetadataRoute } from "next";
import { absolute } from "@/lib/site";

/**
 * `/robots.txt` (D-078).
 *
 * ⚠️ **이것만으로 색인을 막지 않는다.** `robots.txt` 는 크롤링을 막을 뿐이고,
 * 외부에서 링크된 페이지는 크롤링 없이도 색인될 수 있다. 실제 차단은
 * `[locale]/layout.tsx` 의 **기본 noindex 메타**가 한다 (CLAUDE.md 규칙 10).
 * 여기 있는 건 크롤 예산을 아끼고 의도를 명시하는 보조 수단이다.
 *
 * 특히 **도감 소유자 목록은 애초에 서버 렌더 결과에 없다** (FR-07-A-08) —
 * 크롤러가 가져갈 것 자체가 없는 것이 1차 방어다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",          // 어드민 전체 (D-030)
          "/api/",
          "/*/me",           // 마이룸·설정·레벨 — 개인 화면
          "/*/notifications",// S-22 알림함 (D-087)
          "/*/report",       // S-15 신고
          "/*/login",
          "/*/suspended",    // S-21 제재 안내
        ],
      },
    ],
    sitemap: absolute("/sitemap.xml"),
  };
}
