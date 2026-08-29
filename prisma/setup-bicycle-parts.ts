import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * 자전거 **부품 수집 준비** — 매칭 키 + 부품 브랜드 (D-263).
 *
 * ## ⚠️ 부품 도감이 0건인 이유는 두 가지가 막고 있었기 때문이다
 *
 * ### 1. 매칭 키가 카테고리 기본 `{brand, model, year}` 하나뿐이었다
 * 부품에 연식이 들어가면 **같은 휠셋이 연식마다 다른 도감**이 된다:
 * ```
 * Bontrager Aeolus RSL 51 (2022)
 * Bontrager Aeolus RSL 51 (2023)   ← 같은 제품인데 다른 도감
 * ```
 * AI 는 연식을 **지어낼 수 있다** — 숫자라 D-186 슬러그 가드(고유번호가 명칭과
 * 같음 / 숫자 없음)에 걸리지 않는다. 유저도 자기 휠셋 연식을 모른다.
 * 원칙 4(도감은 연결점)가 무너진다.
 *
 * → 부품 7종에 **`{brand, model}`** 종류 전용 매칭 키를 만든다. 완성차는
 *   카테고리 기본 `{brand, model, year}` 를 그대로 쓴다 — 완성차는 연식이
 *   실제로 제품을 가른다 (2023 Tarmac SL7 ≠ 2021 Tarmac SL7).
 *
 * ### 2. 연결 브랜드 40개가 전부 완성차 브랜드였다
 * Trek·Specialized·Canyon·Pinarello… **부품 브랜드가 마스터에 하나도 없었다.**
 * 이대로 `--subtype=drivetrain` 을 돌리면 **Trek 에게 구동계를 묻는 꼴**이다.
 *
 * → 부품 브랜드를 마스터에 넣고 **해당 종류에만** 연결한다. D-255 포함적
 *   scope 의 첫 실사용이다 — 안장 폼에 Shimano 가 안 뜬다.
 *
 * ⚠️ **alias 를 비우지 않는다** (D-047). 한국 유저가 "시마노" 로 검색해도
 * `Shimano` 가 나와야 한다.
 *
 * ```
 * pnpm tsx prisma/setup-bicycle-parts.ts          # 미리보기
 * pnpm tsx prisma/setup-bicycle-parts.ts --apply
 * ```
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes("--apply");

/** 부품 종류 — 완성차(`complete`)는 카테고리 기본을 쓰므로 제외 */
const PART_SUBTYPES = [
  "frame",
  "drivetrain",
  "wheelset",
  "handlebar",
  "saddle",
  "brakes",
  "tire",
];

/**
 * 부품 브랜드 → 만드는 종류.
 *
 * ⚠️ **실제로 그 종류를 만드는 브랜드만 적는다.** 넓게 연결하면 안 만드는
 * 종류를 수집할 때 0건이거나 지어낸 제품이 온다 (D-262 에서 겪었다).
 */
const PART_BRANDS: { name: string; ko: string[]; ja: string[]; subtypes: string[] }[] = [
  { name: "Shimano", ko: ["시마노"], ja: ["シマノ"], subtypes: ["drivetrain", "brakes", "wheelset"] },
  { name: "SRAM", ko: ["스램"], ja: ["スラム"], subtypes: ["drivetrain", "brakes"] },
  { name: "Campagnolo", ko: ["캄파뇰로", "캄파"], ja: ["カンパニョーロ"], subtypes: ["drivetrain", "brakes", "wheelset"] },
  { name: "DT Swiss", ko: ["디티스위스"], ja: ["ディーティースイス"], subtypes: ["wheelset"] },
  { name: "Zipp", ko: ["집"], ja: ["ジップ"], subtypes: ["wheelset", "handlebar"] },
  { name: "ENVE", ko: ["엔비"], ja: ["エンヴィ"], subtypes: ["wheelset", "handlebar"] },
  { name: "Bontrager", ko: ["본트래거"], ja: ["ボントレガー"], subtypes: ["wheelset", "saddle", "handlebar", "tire"] },
  { name: "Mavic", ko: ["마빅"], ja: ["マヴィック"], subtypes: ["wheelset"] },
  { name: "Fizik", ko: ["피직"], ja: ["フィジーク"], subtypes: ["saddle", "handlebar"] },
  { name: "Selle Italia", ko: ["셀레이탈리아"], ja: ["セライタリア"], subtypes: ["saddle"] },
  { name: "Brooks", ko: ["브룩스"], ja: ["ブルックス"], subtypes: ["saddle"] },
  { name: "Continental", ko: ["콘티넨탈"], ja: ["コンチネンタル"], subtypes: ["tire"] },
  { name: "Maxxis", ko: ["맥시스"], ja: ["マキシス"], subtypes: ["tire"] },
  { name: "Schwalbe", ko: ["슈발베"], ja: ["シュワルベ"], subtypes: ["tire"] },
  { name: "Pirelli", ko: ["피렐리"], ja: ["ピレリ"], subtypes: ["tire"] },
  { name: "Deda", ko: ["데다"], ja: ["デダ"], subtypes: ["handlebar"] },
  { name: "3T", ko: ["쓰리티"], ja: ["スリーティー"], subtypes: ["handlebar"] },
  { name: "Hope", ko: ["호프"], ja: ["ホープ"], subtypes: ["brakes"] },
  { name: "Magura", ko: ["마구라"], ja: ["マグラ"], subtypes: ["brakes"] },
];

async function main() {
  console.log(`대상 DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}`);
  console.log(APPLY ? "모드: 적용\n" : "모드: 미리보기 (--apply 로 적용)\n");

  const bike = await prisma.category.findUnique({
    where: { key: "bicycle" },
    select: { id: true },
  });
  if (!bike) throw new Error("자전거 카테고리가 없습니다");

  const subs = await prisma.categorySubtype.findMany({
    where: { categoryId: bike.id },
    select: { id: true, key: true, labelKo: true },
  });
  const byKey = new Map(subs.map((s) => [s.key, s]));

  // ── 1. 부품 종류 매칭 키 ──────────────────────────────────────────────
  let keyMade = 0;
  for (const k of PART_SUBTYPES) {
    const st = byKey.get(k);
    if (!st) {
      console.log(`⚠️ 종류 '${k}' 가 없습니다`);
      continue;
    }
    const has = await prisma.matchingKeyDefinition.findUnique({
      where: { subtypeId: st.id },
      select: { id: true },
    });
    if (has) continue;
    if (APPLY) {
      // ⚠️ 종류 전용 행 — `categoryId` 를 넣지 않는다 (카테고리 XOR 제품군)
      await prisma.matchingKeyDefinition.create({
        data: { subtypeId: st.id, attributeKeys: ["brand", "model"] },
      });
    }
    keyMade++;
  }
  console.log(`① 부품 매칭 키 {brand, model} — ${APPLY ? "생성" : "생성 예정"} ${keyMade}건`);
  console.log(`   완성차는 카테고리 기본 {brand, model, year} 유지`);

  // ── 2. 부품 브랜드 ────────────────────────────────────────────────────
  let brandMade = 0;
  let scopeMade = 0;
  for (const b of PART_BRANDS) {
    if (!APPLY) {
      const exists = await prisma.brand.findUnique({ where: { name: b.name }, select: { id: true } });
      if (!exists) brandMade++;
      scopeMade += b.subtypes.length;
      continue;
    }
    const brand = await prisma.brand.upsert({
      where: { name: b.name },
      // 이미 있으면 alias 를 덮어쓰지 않는다 — 운영이 손본 값일 수 있다
      update: {},
      create: {
        name: b.name,
        // ⚠️ alias 가 없으면 "시마노" 로 검색해도 안 나와 브랜드가 없는 것으로 오인된다 (D-047)
        aliases: { ko: b.ko, ja: b.ja, en: [] },
      },
      select: { id: true },
    });
    brandMade++;
    for (const k of b.subtypes) {
      const st = byKey.get(k);
      if (!st) continue;
      await prisma.brandScope.upsert({
        where: { brandId_scopeId: { brandId: brand.id, scopeId: st.id } },
        update: {},
        // ⚠️ **종류 전용 연결** — 카테고리 공통으로 넣으면 안장 폼에 Shimano 가 뜬다
        create: { brandId: brand.id, categoryId: bike.id, subtypeId: st.id },
      });
      scopeMade++;
    }
  }
  console.log(
    `② 부품 브랜드 ${PART_BRANDS.length}개 (신규 ${brandMade}) · 종류 연결 ${scopeMade}건`,
  );

  if (APPLY) {
    console.log("\n검산 — 종류별 브랜드 수:");
    for (const k of PART_SUBTYPES) {
      const st = byKey.get(k);
      if (!st) continue;
      const n = await prisma.brand.count({
        where: { active: true, scopes: { some: { subtypeId: st.id } } },
      });
      const common = await prisma.brand.count({
        where: { active: true, scopes: { some: { categoryId: bike.id, subtypeId: null } } },
      });
      console.log(`  ${st.labelKo.padEnd(5)} 전용 ${String(n).padStart(2)} + 공통 ${common} = ${n + common}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
