import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * 캠핑에 잘못 붙은 브랜드 연결을 **끊는다** (D-284).
 *
 * ## ⚠️ D-259 의 잔재다
 * 배낭·등반장비를 캠핑에서 등산으로 갈랐는데(D-259) **브랜드 연결은 캠핑에
 * 남았다.** 그래서 캠핑 등록 화면에 신발 브랜드(Danner·Keen·Merrell)와 의류
 * 브랜드(Columbia·The North Face)가 뜬다.
 *
 * ## ⚠️ 대상은 **데이터로** 골랐다 — 이름으로 짐작하지 않았다
 * | 브랜드 | 연결 | 실제 도감 |
 * |---|---|---|
 * | Deuter·Gregory·Osprey | camping, hiking | **hiking 만** |
 * | Mammut·Arc'teryx·Patagonia | +apparel | apparel·hiking 만 |
 * | Columbia·The North Face·Salomon | apparel, camping | **apparel 만** |
 * | Danner·Keen·Merrell | shoes, camping | **도감 0건** |
 *
 * **12개 전부 캠핑 도감이 0건**이다.
 *
 * ⚠️ **`Kzm`·`Tent-Mark Designs`·`YETI` 는 건드리지 않는다.** 도감이 없는 것은
 * 같지만 **진짜 캠핑 브랜드**다 — 아직 수집이 안 됐을 뿐이라 끊으면 나중에
 * 등록할 때 브랜드가 없다.
 *
 * ⚠️ **브랜드를 지우지 않는다** — 캠핑 `BrandScope` 행만 지운다. 각 브랜드는
 * 원래 카테고리(apparel·hiking·shoes) 연결을 유지한다.
 *
 * ⚠️ **캠핑 아이템이 이미 이 브랜드로 등록돼 있으면 멈춘다.** 연결을 끊어도
 * 기존 아이템은 남지만(D-036 과 같은 논리), 그런 아이템이 있다는 것은 이
 * 판단의 전제("캠핑 도감 0건")가 틀렸다는 뜻이다.
 *
 * ```
 * pnpm tsx prisma/detach-camping-brands.ts          # 미리보기
 * pnpm tsx prisma/detach-camping-brands.ts --apply
 * ```
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const APPLY = process.argv.includes("--apply");

/** 캠핑 도감이 0건이고 다른 카테고리에 본거지가 있는 브랜드 */
const DETACH = [
  "Arc'teryx", "Columbia", "Danner", "Deuter", "Gregory", "Keen",
  "Mammut", "Merrell", "Osprey", "Patagonia", "Salomon", "The North Face",
];

async function main() {
  console.log(`대상 DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}`);
  console.log(APPLY ? "모드: 적용\n" : "모드: 미리보기 (--apply 로 적용)\n");

  const cat = await prisma.category.findUnique({ where: { key: "camping" }, select: { id: true } });
  if (!cat) throw new Error("캠핑 카테고리 없음");

  let removed = 0;
  const blocked: string[] = [];
  const skipped: string[] = [];

  for (const name of DETACH) {
    const brand = await prisma.brand.findUnique({
      where: { name },
      select: {
        id: true,
        scopes: { select: { id: true, categoryId: true, category: { select: { key: true } } } },
      },
    });
    if (!brand) { skipped.push(`${name} — 브랜드 없음`); continue; }

    const campingScopes = brand.scopes.filter((s) => s.categoryId === cat.id);
    if (campingScopes.length === 0) { skipped.push(`${name} — 캠핑 연결 없음`); continue; }

    // ⚠️ 이 브랜드로 등록된 **캠핑 아이템**이 있으면 전제가 틀린 것이다
    const items = await prisma.item.count({
      where: { brandId: brand.id, category: { key: "camping" } },
    });
    if (items > 0) { blocked.push(`${name} — 캠핑 아이템 ${items}건이 이 브랜드를 쓴다`); continue; }

    const left = brand.scopes.filter((s) => s.categoryId !== cat.id).map((s) => s.category.key);
    /*
      ⚠️ **남는 연결이 없으면 끊지 않는다.** 어느 카테고리에서도 안 보이는
      브랜드가 된다 — 지우려면 비활성화(D-036)가 올바른 도구다
    */
    if (left.length === 0) { blocked.push(`${name} — 캠핑이 유일한 연결이다`); continue; }

    console.log(`  ${name.padEnd(20)} 캠핑 연결 ${campingScopes.length}개 해제 → [${[...new Set(left)].join(", ")}] 유지`);
    if (APPLY) {
      await prisma.brandScope.deleteMany({ where: { id: { in: campingScopes.map((s) => s.id) } } });
    }
    removed += campingScopes.length;
  }

  console.log(`\n${APPLY ? "해제" : "해제할 것"} ${removed}행`);
  if (blocked.length) {
    console.log(`⚠️ 건너뜀 (전제가 틀렸을 수 있다) ${blocked.length}건`);
    for (const b of blocked) console.log(`   · ${b}`);
  }
  if (skipped.length) for (const s of skipped) console.log(`   · ${s}`);

  if (APPLY) {
    const campingBrands = await prisma.brandScope.count({ where: { categoryId: cat.id } });
    const orphan = await prisma.brand.count({ where: { active: true, scopes: { none: {} } } });
    console.log(`\n검산 — 캠핑 브랜드 ${campingBrands}개 · 연결 없는 활성 브랜드 ${orphan}건 (0이어야 함)`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
