import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  typedRoutes: true,
  images: {
    /**
     * Supabase Storage 만 허용한다 (D-114).
     *
     * ⚠️ **호스트만 열지 않고 경로까지 좁힌다.** `/storage/v1/object/public/**`
     * 밖으로 열면 우리 이미지 최적화기가 남의 이미지를 대신 서빙하는 통로가 된다.
     *
     * 로컬 개발 업로드는 `/uploads/...` 상대 경로라 여기 등록이 필요 없다.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
