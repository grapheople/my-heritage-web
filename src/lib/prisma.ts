import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { runtimeDatabaseUrl } from "./db-url";

/**
 * Prisma 7은 SQL provider에서 driver adapter를 요구한다.
 * dev 환경의 HMR로 커넥션이 새는 것을 막기 위해 globalThis에 캐싱한다.
 *
 * ## ⚠️ 프로덕션에서는 **풀링된** DATABASE_URL 을 써야 한다
 *
 * Vercel Functions 는 요청마다 인스턴스가 생긴다. 직접 연결을 쓰면 트래픽이
 * 조금만 늘어도 Postgres `max_connections` 를 넘겨 **DB 가 새 연결을 거부한다.**
 * 코드는 정상인데 전부 500 이 되는 형태로 터진다.
 *
 * 그래서 `DATABASE_URL` 은 풀러(`-pooler` 호스트)를 가리키고, **마이그레이션만**
 * `DIRECT_URL`(직접 연결)을 쓴다 — 풀러의 transaction 모드가 advisory lock 을
 * 지원하지 않기 때문이다 (`prisma.config.ts` 참조).
 *
 * 아래 `connection_limit` 은 **풀러가 없는 환경**의 안전망이다. 풀러를 쓰면
 * 무의미하지만, 실수로 직접 연결을 넣었을 때 DB 를 통째로 마비시키지는 않는다.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient() {
  // Supabase/Vercel 이 주입하는 이름까지 인식한다 (`db-url.ts`)
  const connectionString = runtimeDatabaseUrl();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL(또는 POSTGRES_PRISMA_URL)이 설정되지 않았습니다 (.env.example 참조)",
    );
  }
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      // 인스턴스당 상한. 서버리스에서는 인스턴스가 많으므로 작게 잡는다 —
      // 풀러를 쓰면 풀러가 실제 상한을 관리한다
      max: process.env.NODE_ENV === "production" ? 3 : 10,
    }),
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
