import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * **종류 전용 브랜드의 카테고리 공통 행을 지운다** (D-283).
 *
 * ## ⚠️ 왜 필요한가 — 종류 축이 아무것도 좁히지 못하고 있었다
 * D-263 에서 자전거 부품 브랜드를 넣을 때 **카테고리 공통 행과 종류 행을 둘 다**
 * 만들었다. 포함적 scope(D-255)에서 공통 행이 있으면 **전 종류에 보이므로**
 * 종류 행은 아무 효과가 없다 — 실제로 `?subtype=wheelset` 과 `?subtype=` 없는
 * 결과가 **똑같이 59건**이었다.
 *
 * ## ⚠️ 지워도 유저가 막히지 않는 근거
 * | 확인 | 값 |
 * |---|---|
 * | 자전거 `subtypeRequired` | **예** — 종류를 반드시 고른다 |
 * | 이 브랜드들로 등록된 아이템 | **0건** |
 * | 프레임 도감 75건 중 이 브랜드로 시작하는 것 | **0건** |
 *
 * 종류가 필수라 "종류를 안 골라서 브랜드가 안 보이는" 상태 자체가 없다.
 *
 * ⚠️ **종류 행이 없는 브랜드는 건드리지 않는다.** 공통 행만 있는 브랜드의
 * 공통 행을 지우면 그 브랜드가 **어디에서도 안 보인다.**
 *
 * ⚠️ **브랜드를 지우지 않는다** — `BrandScope` 행만 지운다. 브랜드 자체는
 * 남아 다른 카테고리 연결과 alias 를 유지한다.
 *
 * ```
 * pnpm tsx prisma/prune-part-brand-common-scope.ts          # 미리보기
 * pnpm tsx prisma/prune-part-brand-common-scope.ts --apply
 * ```
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const APPLY = process.argv.includes("--apply");
const CATEGORY = process.argv.find((a) => a.startsWith("--category="))?.split("=")[1] ?? "bicycle";

async function main() {
  console.log(`대상 DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}`);
  console.log(APPLY ? "모드: 적용" : "모드: 미리보기 (--apply 로 적용)");

  const cat = await prisma.category.findUnique({
    where: { key: CATEGORY },
    select: { id: true, key: true, subtypeRequired: true },
  });
  if (!cat) throw new Error(`카테고리 ${CATEGORY} 없음`);

  /*
    ⚠️ **종류 필수가 아니면 멈춘다.** 종류를 안 골라도 되는 카테고리에서
    공통 행을 지우면 유저가 그 브랜드를 영영 못 고른다 — D-255 가 브랜드를
    포함적으로 만든 이유가 그것이다
  */
  if (!cat.subtypeRequired) {
    console.log(`\n⚠️ ${CATEGORY} 는 종류가 필수가 아닙니다. 공통 행을 지우면`);
    console.log(`   종류를 안 고른 유저에게 그 브랜드가 보이지 않습니다 — 중단합니다.`);
    return;
  }

  const scoped = await prisma.brandScope.findMany({
    where: { categoryId: cat.id, subtypeId: { not: null } },
    select: { brandId: true, brand: { select: { name: true } }, subtype: { select: { key: true } } },
  });
  const byBrand = new Map<string, { name: string; subs: string[] }>();
  for (const r of scoped) {
    if (!byBrand.has(r.brandId)) byBrand.set(r.brandId, { name: r.brand.name, subs: [] });
    byBrand.get(r.brandId)!.subs.push(r.subtype!.key);
  }
  console.log(`\n종류 전용 행을 가진 브랜드 ${byBrand.size}개`);

  let removed = 0;
  for (const [brandId, info] of byBrand) {
    const common = await prisma.brandScope.findFirst({
      where: { brandId, categoryId: cat.id, subtypeId: null },
      select: { id: true },
    });
    if (!common) continue;
    console.log(`  ${info.name.padEnd(16)} 공통 행 삭제 → ${info.subs.join(", ")} 에서만 보임`);
    if (APPLY) await prisma.brandScope.delete({ where: { id: common.id } });
    removed++;
  }

  console.log(`\n${APPLY ? "삭제" : "삭제할 것"} ${removed}행`);

  if (APPLY) {
    const orphan = await prisma.brand.count({
      where: { active: true, scopes: { none: {} } },
    });
    const commonLeft = await prisma.brandScope.count({
      where: { categoryId: cat.id, subtypeId: null },
    });
    console.log(
      `검산 — 연결이 하나도 없는 활성 브랜드 ${orphan}건 (0이어야 함)` +
        ` · ${CATEGORY} 공통 행 ${commonLeft}개`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
