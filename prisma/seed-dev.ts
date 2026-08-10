// .env.local 을 먼저 읽는다 — Next.js 와 순서를 맞춘다 (prisma/env.ts)
import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { AuthProvider } from "../src/generated/prisma/enums";
import { describeDatabase, isLocalDatabase } from "../src/lib/db-url";

/**
 * 로컬 개발용 시드 — **프로덕션에서 실행되지 않는다** (D-097).
 *
 * ## 왜 seed.ts 와 분리하는가
 * `seed.ts` 는 문서로 확정된 마스터 데이터만 담는다. 여기 있는 것은 **운영이
 * 정해야 하는 값**이거나 **개발 편의용 가짜 계정**이다. 프로덕션에 들어가면
 * 운영 판단을 개발 데이터가 덮어쓴다.
 *
 * ## 여기 담는 것
 * 1. **개발용 User + Room** — 인증 우회로(`lib/auth/viewer.ts`)가 가리킬 실제 행.
 *    OAuth 자격증명이 없어 실제 로그인을 못 하므로 이게 없으면 아이템을 저장할
 *    대상이 없다
 * 2. **CategoryAttribute 조합** — `ItemAttributeValue` 가 이걸 참조한다.
 *    시드가 넣지 않으므로(FR-02-A-01 — 어드민이 운영에서 구성) 새 DB 에서는
 *    아이템을 한 건도 등록할 수 없다. **출시 시에는 어드민 A-02 에서 구성한다** (D-097)
 *
 * ## 여기 담지 않는 것
 * - **카테고리별 고유 속성**(무브먼트·케이스 지름 등). PRD 는 **공통 14종만**
 *   확정했고 카테고리 고유 속성은 어드민이 추가한다 (D-038). 추측으로 만들면
 *   확정값처럼 굳는다 (공통 규칙 9)
 * - 매칭 키 지정. 옷·자전거·데스크테리어는 D-034 조사 미완이다
 */

if (process.env.NODE_ENV === "production") {
  console.error("❌ seed-dev 는 프로덕션에서 실행할 수 없습니다 (D-097).");
  process.exit(1);
}

/**
 * ⚠️ **`NODE_ENV` 만으로는 부족하다.**
 *
 * `.env.local` 이 원격 DB(Supabase 등)를 가리키면 **`NODE_ENV` 는 development
 * 인데 원격을 건드린다.** 개발용 유저·조합을 프로덕션에 밀어넣는 사고가 된다 —
 * D-097 이 "운영 판단을 개발 데이터가 덮어쓰면 안 된다"고 한 그 상황이다.
 *
 * 호스트를 직접 보는 것이 유일하게 확실한 판정이다.
 */
if (!isLocalDatabase()) {
  console.error(
    `❌ 로컬 DB 가 아닙니다: ${describeDatabase()}\n` +
      "   seed-dev 는 localhost 에서만 실행됩니다 (D-097).\n" +
      "   원격에 마스터 데이터를 넣으려면 `pnpm prisma db seed` 를 쓰고,\n" +
      "   카테고리별 속성 조합은 어드민 A-02 에서 구성하세요.",
  );
  process.exit(1);
}

/**
 * ⚠️ 여기만 `DATABASE_URL`(런타임 URL)을 쓴다 — **로컬 전용 스크립트**이고
 * 위 가드가 localhost 가 아니면 이미 종료시킨다. 다른 스크립트(시드·import·
 * 어드민 추가)는 **마이그레이션과 같은 대상**을 봐야 하므로 `migrationDatabaseUrl()`
 * 을 쓴다.
 */
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/** 인증 우회로가 쓰는 고정 식별자 — `lib/auth/viewer.ts` 와 일치해야 한다 */
export const DEV_SUBJECT = "dev-local-subject";

/**
 * 공통 속성 14종을 카테고리에 붙인다.
 *
 * `required` 는 아래 기준만 쓴다 — 나머지는 운영 판단이라 임의로 정하지 않는다:
 * - `brand` · `model` : 아이템 명칭(D-073)이 이 둘에서 파생되므로 없으면 이름이 없다
 * - `uniqueId` : **매칭 키가 검증된 카테고리에서만** 필수 (D-013·D-034).
 *   옷·자전거·데스크테리어는 조사 미완이라 필수로 걸지 않는다
 */
const REQUIRED_BASE = ["brand", "model"];
const MATCHING_KEY_VERIFIED = new Set(["watch", "shoes", "camping"]);

/** 표시 순서 — 정보 위계상 식별 정보가 먼저, 소유 정보가 뒤 */
const ORDER = [
  "brand", "model", "uniqueId", "serialNo",
  "size", "color", "condition", "year", "accessories",
  "purchasedFrom", "purchaseDate", // purchasePrice 는 비활성 (D-163)
  "note", "referenceUrl",
];

async function main() {
  /* ── 1. 개발용 유저 + 방 ── */
  const user = await prisma.user.upsert({
    where: { provider_subject: { provider: AuthProvider.GOOGLE, subject: DEV_SUBJECT } },
    update: {},
    create: {
      provider: AuthProvider.GOOGLE,
      subject: DEV_SUBJECT,
      email: "dev@example.com",
      language: "ko",
      // 경험치 1일 1회 판정 기준 (D-056)
      timezone: "Asia/Seoul",
      room: { create: { name: "시계쟁이 준", bio: "빈티지 다이버만 모읍니다. 서울 · 2019년부터." } },
    },
    select: { id: true, room: { select: { id: true, name: true } } },
  });
  console.log(`  User  ${user.id}`);
  console.log(`  Room  ${user.room?.id}  "${user.room?.name}"`);

  /* ── 2. CategoryAttribute 조합 (D-097) ── */
  const cats = await prisma.category.findMany({ select: { id: true, key: true } });
  const defs = await prisma.attributeDefinition.findMany({ select: { id: true, key: true } });
  if (cats.length === 0 || defs.length === 0) {
    console.error("❌ 카테고리·속성 정의가 없습니다. 먼저 `pnpm prisma db seed` 를 실행하세요.");
    process.exit(1);
  }
  const defByKey = new Map(defs.map((d) => [d.key, d]));

  let n = 0;
  for (const cat of cats) {
    for (const [i, key] of ORDER.entries()) {
      const def = defByKey.get(key);
      if (!def) continue; // 시드에 없는 key 는 건너뛴다
      const required =
        REQUIRED_BASE.includes(key) ||
        (key === "uniqueId" && MATCHING_KEY_VERIFIED.has(cat.key));

      await prisma.categoryAttribute.upsert({
        where: {
          categoryId_attributeDefinitionId: {
            categoryId: cat.id,
            attributeDefinitionId: def.id,
          },
        },
        create: { categoryId: cat.id, attributeDefinitionId: def.id, required, displayOrder: i },
        // 멱등 — 순서·필수만 갱신한다. 유저가 입력한 값은 건드리지 않는다
        update: { required, displayOrder: i },
      });
      n++;
    }
  }
  console.log(`  CategoryAttribute  ${n}건 (카테고리 ${cats.length} × 속성 ${ORDER.length})`);
  console.log("\n  ⚠️ 이 조합은 개발용이다. 출시 시에는 어드민 A-02 에서 구성한다 (D-097).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
