// .env.local 을 먼저 읽는다 — Next.js 와 순서를 맞춘다 (prisma/env.ts)
import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

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
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
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
