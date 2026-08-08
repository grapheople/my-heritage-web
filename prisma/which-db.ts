import "./env";
import {
  describeDatabase, isLocalDatabase, migrationDatabaseUrl, runtimeDatabaseUrl,
} from "../src/lib/db-url";

/**
 * 지금 어느 DB 를 보고 있는지 (`pnpm db:which`).
 *
 * ## ⚠️ 이 스크립트가 필요한 이유
 * `.env.local` 과 `.env` 가 서로 다른 DB 를 가리키면 **앱과 Prisma CLI 가 다른
 * DB 를 본다.** 실제로 그 상태였고, 증상이 "마이그레이션했는데 화면에 반영이
 * 안 된다" 로 나타나 원인을 찾기 어렵다.
 *
 * 비밀번호는 출력하지 않는다 — 호스트·포트·DB 이름만 낸다.
 */
const runtime = runtimeDatabaseUrl();
const migration = migrationDatabaseUrl();

const rows: [string, string][] = [
  ["런타임 (앱)", describeDatabase(runtime)],
  ["마이그레이션·시드", describeDatabase(migration)],
];
console.log();
for (const [k, v] of rows) console.log(`  ${k.padEnd(20)} ${v}`);
console.log(
  `  ${"로컬 DB 인가".padEnd(20)} ${isLocalDatabase(runtime) ? "예" : "아니오 — 원격"}`,
);
console.log();

/** 호스트만 뽑는다 — 혼재 판정에 쓴다 */
function hostOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/* ── 흔한 실수를 짚어준다 ── */
const warn = (m: string) => console.log(`  ⚠️  ${m}`);

if (!runtime) warn("런타임 URL 이 없다. DATABASE_URL 또는 POSTGRES_PRISMA_URL 을 설정하세요.");

/**
 * ⚠️ **가장 위험한 상태: 앱과 CLI 가 다른 DB 를 본다.**
 *
 * 실제로 겪었다 — `.env` 는 원격, `.env.local` 은 다른 값이었고 `dotenv/config`
 * 가 `.env` 만 읽어서 앱과 Prisma CLI 가 갈렸다. 증상은 "마이그레이션했는데
 * 화면에 반영이 안 된다" 로 나타나 원인을 찾기 어렵다.
 *
 * 같은 서버의 풀링/직접 포트 차이는 **정상**이므로 호스트로 비교한다.
 */
const rHost = hostOf(runtime);
const mHost = hostOf(migration);
if (rHost && mHost && rHost !== mHost) {
  warn(
    `앱과 마이그레이션이 **다른 DB 서버**를 본다.\n` +
      `      앱: ${rHost}\n` +
      `      CLI: ${mHost}\n` +
      "      마이그레이션이 화면에 반영되지 않는다. `.env.local` 과 `.env` 를 확인하세요.",
  );
}

// 풀링 판정 — Supabase 는 6543 + pgbouncer=true, Neon 은 `-pooler` 호스트
const pooled =
  !!runtime && (/-pooler/.test(runtime) || /pgbouncer=true/.test(runtime) || /:6543/.test(runtime));
if (runtime && !isLocalDatabase(runtime) && !pooled) {
  warn(
    "원격인데 런타임 URL 이 **풀링되지 않았다.** 서버리스에서 커넥션 상한을 넘겨\n" +
      "      전부 500 이 될 수 있다 (D-113). 풀러 문자열을 쓰세요.",
  );
}
if (migration && /pgbouncer=true/.test(migration)) {
  warn(
    "마이그레이션 URL 이 transaction 풀러다. advisory lock 을 못 잡아 실패한다 —\n" +
      "      DIRECT_URL(또는 POSTGRES_URL_NON_POOLING)을 쓰세요 (D-113).",
  );
}
if (runtime && migration && runtime === migration && !isLocalDatabase(runtime)) {
  warn("런타임과 마이그레이션이 같은 URL 이다. 원격에서는 나뉘어야 한다 (D-113).");
}
console.log();
