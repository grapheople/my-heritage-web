import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  typedRoutes: true,
  images: {
    /**
     * Vercel Blob 만 허용한다 (D-101).
     *
     * ⚠️ **와일드카드(`**`)를 쓰지 않는다.** 아무 호스트나 열면 우리 이미지
     * 최적화기가 남의 이미지를 대신 서빙하는 통로가 된다.
     *
     * 로컬 개발 업로드는 `/uploads/...` 상대 경로라 여기 등록이 필요 없다.
     */
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
