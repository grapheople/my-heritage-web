import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI 설정 (마이그레이션·시드).
 *
 * ## ⚠️ 마이그레이션은 **직접 연결**을 써야 한다
 *
 * 서버리스에서는 커넥션 풀러(PgBouncer 등)를 앞에 두는데, 풀러의 transaction
 * 모드는 **advisory lock 과 일부 DDL 을 지원하지 않는다.** `prisma migrate` 는
 * 동시 실행을 막기 위해 advisory lock 을 쓰므로 풀러를 거치면 실패하거나
 * 조용히 어긋난다.
 *
 * 그래서 URL 이 두 개다:
 *
 * | 변수 | 쓰는 곳 | 형태 |
 * |---|---|---|
 * | `DATABASE_URL` | **런타임** (`lib/prisma.ts`) | 풀링됨 (`-pooler` 호스트) |
 * | `DIRECT_URL` | **마이그레이션·시드** (이 파일) | 직접 연결 |
 *
 * 로컬 개발에는 풀러가 없으므로 `DIRECT_URL` 을 비워두면 `DATABASE_URL` 을 쓴다.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // 직접 연결이 있으면 그것을 쓴다. 로컬은 풀러가 없어 DATABASE_URL 하나뿐이다
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
  },
});
