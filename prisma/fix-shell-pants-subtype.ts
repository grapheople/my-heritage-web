import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  describeDatabase,
  migrationDatabaseUrl,
  pgSslConfig,
  stripSslMode,
} from "../src/lib/db-url";

/**
 * 셸에 들어간 **방수 바지**를 등산바지로 옮긴다 (D-307).
 *
 * ## ⚠️ 종류 힌트로도 못 막는 자리가 있었다
 * D-304 가 `--subtype=` 힌트로 교차 오분류 0건을 만들었는데, **셸을 물으면
 * 셸 팬츠가 딸려온다.** 모델 입장에서는 틀린 답이 아니다 — `Storm Cruiser
 * Pants` 는 실제로 하드셸이다. 레이어 축에서는 셸이 맞다.
 *
 * **우리 분류에서만 틀리다.** D-302 가 *"레이어 축은 상의 이야기라 하의를 못
 * 덮는다"* 며 `등산바지` 를 별도 종류로 뒀기 때문이다. 즉 이건 모델의 실수가
 * 아니라 **우리 축과 업계 용어가 어긋나는 지점**이고, 수집할 때마다 재발한다.
 *
 * ## ⚠️ 같은 카테고리 안의 이동이라 단순하다
 * `categoryId` 가 그대로라 D-260 이 겪은 것(매칭 키 두 사본·유일성 재판정)이
 * 대부분 사라진다. 그래도 **옮길 스코프의 충돌은 본다** — `scopeId` 가
 * `subtypeId` 로 갈리므로 같은 키가 이미 있으면 유니크에 걸린다.
 *
 * ```
 * pnpm tsx prisma/fix-shell-pants-subtype.ts          # 미리보기
 * pnpm tsx prisma/fix-shell-pants-subtype.ts --apply
 * ```
 */
const APPLY = process.argv.includes("--apply");

/** 이름에 하의가 명시된 것만 — 추측하지 않는다 */
const PANTS_PATTERN = /(trousers?|\bpants?\b|\bbib\b)/i;

const url = migrationDatabaseUrl();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: stripSslMode(url), ssl: pgSslConfig(url) }),
});

async function main() {
  console.log(`대상 DB — ${describeDatabase(url)}`);
  console.log(APPLY ? "모드: 적용\n" : "모드: 미리보기 (--apply 로 적용)\n");

  const hiking = await prisma.category.findUnique({
    where: { key: "hiking" },
    select: { id: true },
  });
  if (!hiking) throw new Error("등산 카테고리가 없습니다");

  const subs = await prisma.categorySubtype.findMany({
    where: { categoryId: hiking.id },
    select: { id: true, key: true },
  });
  const pantsId = subs.find((s) => s.key === "pants")?.id;
  if (!pantsId) throw new Error("등산바지 종류가 없습니다");
  // 상의 레이어에 들어간 것만 본다 — 배낭·신발에 'pants' 가 들어갈 일은 없다
  const upperIds = subs
    .filter((s) => ["shell", "mid-layer", "insulation", "base-layer"].includes(s.key))
    .map((s) => s.id);

  const rows = await prisma.codexItem.findMany({
    where: { categoryId: hiking.id, subtypeId: { in: upperIds } },
    select: { id: true, displayName: true, normalizedKey: true, subtypeId: true },
  });
  const targets = rows.filter((r) => PANTS_PATTERN.test(r.displayName));
  console.log(`상의 레이어 ${rows.length}건 중 하의 이름 ${targets.length}건`);

  let moved = 0;
  const clashes: string[] = [];
  for (const t of targets) {
    const dup = await prisma.codexItem.findFirst({
      where: { scopeId: pantsId, normalizedKey: t.normalizedKey, id: { not: t.id } },
      select: { displayName: true },
    });
    if (dup) {
      clashes.push(`${t.displayName} (충돌: ${dup.displayName})`);
      continue;
    }
    const myKeys = await prisma.codexMatchKey.findMany({
      where: { codexItemId: t.id },
      select: { value: true },
    });
    const taken = await prisma.codexMatchKey.findFirst({
      where: {
        scopeId: pantsId,
        value: { in: myKeys.map((k) => k.value) },
        codexItemId: { not: t.id },
      },
      select: { value: true },
    });
    if (taken) {
      clashes.push(`${t.displayName} (키 충돌: ${taken.value})`);
      continue;
    }

    console.log(`  ${APPLY ? "이동" : "이동 예정"} — ${t.displayName}`);
    if (APPLY) {
      // ⚠️ 매칭 키의 subtypeId 사본도 함께 바꾼다 (D-260)
      await prisma.$transaction(async (tx) => {
        await tx.codexItem.update({ where: { id: t.id }, data: { subtypeId: pantsId } });
        await tx.codexMatchKey.updateMany({
          where: { codexItemId: t.id },
          data: { subtypeId: pantsId },
        });
      });
    }
    moved++;
  }

  console.log(`\n${APPLY ? "이동" : "이동 예정"} ${moved}건 · 충돌 ${clashes.length}건`);
  for (const c of clashes) console.log(`   ⚠️ ${c}`);

  if (APPLY) {
    const mismatch = await prisma.codexMatchKey.count({
      where: { codexItem: { subtypeId: pantsId }, subtypeId: { not: pantsId } },
    });
    console.log(`검산 — 매칭 키 subtypeId 어긋남 ${mismatch}건 (0이어야 함)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
