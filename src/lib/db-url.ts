import { readFileSync } from "node:fs";
import { join } from "node:path";

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

/**
 * ⚠️ **`sslmode` 를 URL 에서 떼어낸다.**
 *
 * `pg` 는 연결 문자열의 `sslmode` 를 보고 **자체 SSL 설정을 만들어** 우리가
 * 넘긴 `ssl` 객체를 덮는다. 그래서 CA 를 고정해도 반영되지 않고
 * `self-signed certificate in certificate chain` 이 계속 난다 — 실제로 그랬다.
 *
 * `pgbouncer`·`supa` 같은 Prisma·Supabase 전용 파라미터는 pg 가 무시하므로
 * 그대로 둔다.
 */
export function stripSslMode(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Postgres TLS 설정 (D-115).
 *
 * ## ⚠️ Supabase 는 Postgres 에 **자체 CA** 를 쓴다
 * 리프 인증서가 `Supabase Root 2021 CA` 로 서명돼 있고, 그 루트는 시스템 신뢰
 * 저장소에 없다. 그래서 Node 는 `self-signed certificate in certificate chain`
 * 으로 거부한다. **중간자 공격이 아니다** — 인증서 체인을 직접 확인했다
 * (subject `*.pooler.supabase.com`, issuer `O=Supabase Inc`).
 *
 * ## ⚠️ `rejectUnauthorized: false` 로 끄지 않는다
 * 흔한 해법이지만 **암호화만 하고 상대를 확인하지 않는 것**이다. 그러면 실제
 * 중간자가 끼어들어도 구분할 수 없다 — 우리는 위 진단으로 "지금은 중간자가
 * 없다"를 확인했을 뿐, 앞으로도 없다는 보장은 아니다.
 *
 * **CA 를 저장소에 넣고 그것으로 검증한다.** 검증은 유지하면서 신뢰 앵커만
 * 추가하는 방식이다. `authorized=true` 로 확인했다.
 *
 * 파일이 없으면 `undefined` 를 내 pg 의 기본 동작에 맡긴다 — 로컬 docker 는
 * TLS 를 안 쓴다.
 */
export function pgSslConfig(url = runtimeDatabaseUrl()): { ca: string } | undefined {
  if (!url) return undefined;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return undefined;
  }
  if (!host.endsWith(".supabase.com") && !host.endsWith(".supabase.co")) return undefined;

  const inline = process.env.SUPABASE_CA_CERT;
  if (inline) return { ca: inline };
  try {
    // 저장소에 커밋한 공개 CA. 비밀이 아니다
    return { ca: readFileSync(join(process.cwd(), "prisma/certs/supabase-root-2021-ca.crt"), "utf8") };
  } catch {
    return undefined;
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
