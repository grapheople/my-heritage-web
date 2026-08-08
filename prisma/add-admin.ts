// .env.local 을 먼저 읽는다 — Next.js 와 순서를 맞춘다 (prisma/env.ts)
import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  describeDatabase, migrationDatabaseUrl, pgSslConfig, stripSslMode,
} from "../src/lib/db-url";

/**
 * 최초 어드민 등록 (D-104).
 *
 * ## ⚠️ 왜 스크립트가 필요한가
 * 어드민이 0명이면 `/admin` 자체에 들어갈 수 없다 — 프로덕션에서는 개발
 * 우회로도 꺼져 있다. 그래서 **최초 1명은 화면으로 만들 수 없다.**
 * 결함이 아니라 부트스트랩의 성질이다.
 *
 * 2명째부터는 A-14 화면에서 초대한다. 그래야 `invitedBy` 가 남는다.
 *
 *   pnpm admin:add name@kakaohealthcare.com "Pax"
 */
/**
 * ⚠️ **마이그레이션과 같은 DB 를 봐야 한다.**
 *
 * `DATABASE_URL` 을 그대로 쓰면 안 된다 — 로컬 개발에서 그 값은 docker 를
 * 가리키는데, 시드·import 는 **마이그레이션과 같은 대상**(원격)이어야 한다.
 * 실제로 이 차이 때문에 `prisma migrate deploy` 는 Supabase 에, 시드는
 * 로컬 docker 에 들어간 적이 있다 (`import` 가 "신규 0건 · 갱신 290건" 을
 * 냈다 — 깨끗한 DB 라면 신규 290 이어야 했다).
 */
const adapter = new PrismaPg({
  // ⚠️ `sslmode` 를 떼야 아래 `ssl` 이 반영된다 (D-115)
  connectionString: stripSslMode(migrationDatabaseUrl()),
  ssl: pgSslConfig(migrationDatabaseUrl()),
});
const prisma = new PrismaClient({ adapter });

async function main() {
  // ⚠️ 어느 DB 에 쓰는지 항상 보여준다 — 시드가 조용히 엉뚱한 DB 로 간 적이 있다
  console.log(`  대상 DB: ${describeDatabase(migrationDatabaseUrl())}`);
  const [email, name] = process.argv.slice(2);
  if (!email || !name) {
    console.error("사용법: pnpm admin:add <이메일> <이름>");
    process.exit(1);
  }

  const existing = await prisma.adminUser.count();
  const admin = await prisma.adminUser.upsert({
    where: { email: email.toLowerCase() },
    // 회수됐던 계정이면 되살린다. 새로 만들면 이력이 두 행으로 갈린다
    update: { name, active: true, deactivatedBy: null, deactivatedAt: null },
    // ⚠️ `invitedBy` 를 채우지 않는다 — 화면 밖에서 들어온 것이 사실이고,
    //    가짜 초대자를 적으면 이력이 거짓이 된다
    create: { email: email.toLowerCase(), name },
    select: { id: true, email: true, name: true },
  });

  console.log(`  ✅ ${admin.name} <${admin.email}>`);
  if (existing === 0) {
    console.log("  최초 어드민입니다. 2명째부터는 A-14 화면에서 초대하세요 (invitedBy 가 남습니다).");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
