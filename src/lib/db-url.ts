/**
 * DB 커넥션 문자열 해석 (D-113).
 *
 * ## ⚠️ 왜 이름이 여러 개인가
 * Vercel 의 Supabase 연동은 환경 변수를 **자기 이름으로** 주입한다
 * (`POSTGRES_PRISMA_URL` 등). 우리 계약은 `DATABASE_URL`·`DIRECT_URL` 이지만,
 * 주입된 이름도 인식하면 **Vercel 에서 손으로 옮겨 적을 일이 없다** —
 * 옮겨 적는 과정에서 풀링/직접을 뒤바꾸는 것이 흔한 사고다.
 *
 * | 우리 계약 | Supabase/Vercel 주입 이름 | 포트 | 특징 |
 * |---|---|:---:|---|
 * | `DATABASE_URL` (런타임) | `POSTGRES_PRISMA_URL` | 6543 | transaction 풀러 (`pgbouncer=true`) |
 * | `DIRECT_URL` (마이그레이션) | `POSTGRES_URL_NON_POOLING` | 5432 | session 모드 — advisory lock 가능 |
 *
 * ⚠️ **`POSTGRES_URL` 은 쓰지 않는다.** 6543(transaction 풀러)인데
 * `pgbouncer=true` 가 없어서, 그대로 마이그레이션에 쓰면 lock 을 못 잡는다.
 * 이름만 보면 "기본 URL" 처럼 보여 가장 헷갈리는 값이다.
 */

/** 런타임용 — **풀링된** 문자열이어야 한다 */
export function runtimeDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
}

/**
 * 마이그레이션·시드용 — **직접(session) 연결**.
 * 없으면 런타임 URL 로 떨어진다 (로컬은 풀러가 없다).
 */
export function migrationDatabaseUrl(): string | undefined {
  return (
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    runtimeDatabaseUrl()
  );
}

/**
 * 로컬 DB 인가 — **파괴적 스크립트의 안전장치**다.
 *
 * `pnpm db:seed-dev` 는 `NODE_ENV=production` 만 막는데, 로컬에서 `.env.local` 이
 * 원격 DB 를 가리키면 **`NODE_ENV` 는 development 이면서 원격을 건드린다.**
 * 호스트를 직접 보는 것이 유일하게 확실한 판정이다.
 */
export function isLocalDatabase(url = migrationDatabaseUrl()): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/** 로그·에러에 쓸 안전한 표기 — 비밀번호를 노출하지 않는다 */
export function describeDatabase(url = migrationDatabaseUrl()): string {
  if (!url) return "(미설정)";
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(파싱 불가)";
  }
}
