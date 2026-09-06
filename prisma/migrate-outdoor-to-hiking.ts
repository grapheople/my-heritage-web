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
 * 옷·신발에 있던 **등산 장비**를 등산으로 옮긴다 (D-299, D-260 과 같은 유형).
 *
 * ## ⚠️ 브랜드로 고르지 않는다 — 이름을 하나씩 봤다
 * "아웃도어 브랜드면 등산"으로 뽑으면 **샌들과 스트리트웨어가 딸려온다.**
 * 실제로 후보 50건에 `KEEN Newport H2`(샌들) · `TNF 1996 Retro Nuptse`(스트리트
 * 웨어) 가 들어 있었다. 그래서 목록을 **명시적으로 적는다.** 여기 없는 것은
 * 옮기지 않는다.
 *
 * D-216 이 캠핑 혼입을 "브랜드 조사가 옷을 끌고 온다"로 진단한 것과 같은
 * 함정이다 — 원인이 브랜드라면 판정도 브랜드로 하면 안 된다.
 *
 * ## ⚠️ 남기는 것도 적는다
 * `KEEP` 에 왜 남기는지 이유를 함께 둔다. 안 적으면 다음 사람이 "빠뜨렸나"
 * 로 읽고 다시 옮긴다.
 *
 * ## ⚠️ 보유자가 있으면 멈춘다 (D-260)
 * 유저 아이템의 카테고리를 말없이 바꾸면 그 유저의 방 진열이 이동한다.
 *
 * ## ⚠️ 브랜드 연결이 먼저다 (D-044)
 * 등산에 브랜드가 안 붙어 있으면 유저가 그 도감에 닿는 경로가 없다.
 *
 * ```
 * pnpm tsx prisma/migrate-outdoor-to-hiking.ts          # 미리보기
 * pnpm tsx prisma/migrate-outdoor-to-hiking.ts --apply
 * ```
 */
const APPLY = process.argv.includes("--apply");

/** 이관 대상 브랜드를 등산에 붙인다. 마스터에 있는 **정확한 이름**이다 */
const BRANDS = [
  "Arc'teryx",
  "Columbia",
  "Fjällräven",
  "Mammut",
  "Montbell",
  "Patagonia",
  "Salomon",
  "The North Face",
  "Merrell",
  // ⚠️ 마스터 표기는 `Keen` 이다 (`KEEN` 아님) — 도감 표시명과 다르다
  "Keen",
];

/**
 * 이관 목록 — `displayName` 완전 일치.
 *
 * 레이어 판정 기준:
 * - `shell` — 방수·방풍 아우터 (하드셸·레인셸·윈드셸)
 * - `insulation` — 충전재가 있는 것 (다운·합성솜)
 * - `mid-layer` — 플리스·소프트셸
 * - `pants` — 하의 (레이어 축이 덮지 못한다)
 * - `footwear` — 등산화
 */
const MOVES: { name: string; subtype: string }[] = [
  // ── shell — 방수·방풍 아우터
  { name: "Arc'teryx Alpha SV Jacket", subtype: "shell" },
  { name: "Arc'teryx Beta AR Jacket", subtype: "shell" },
  // 3-in-1 인터체인지 — 겉이 방수셸이다
  { name: "Columbia Bugaboo II Fleece Interchange Jacket", subtype: "shell" },
  { name: "Columbia Watertight II Jacket", subtype: "shell" },
  // HS = Hardshell (Mammut 표기)
  { name: "Mammut Convey Tour HS Hooded Jacket", subtype: "shell" },
  { name: "Mammut Nordwand Pro HS Hooded Jacket", subtype: "shell" },
  { name: "Montbell Storm Cruiser Jacket", subtype: "shell" },
  { name: "Montbell Versalite Jacket", subtype: "shell" },
  // 윈드셸 — 방수는 아니지만 최외곽에 입는다
  { name: "Patagonia Houdini Jacket", subtype: "shell" },
  { name: "Patagonia Torrentshell 3L Jacket", subtype: "shell" },
  { name: "Salomon Agile Wind Jacket", subtype: "shell" },
  { name: "Salomon Bonatti Waterproof Jacket", subtype: "shell" },
  { name: "Salomon S/Lab Ultra Jacket", subtype: "shell" },
  { name: "The North Face Resolve Jacket", subtype: "shell" },

  // ── insulation — 충전재
  { name: "Arc'teryx Atom LT Hoody", subtype: "insulation" },
  { name: "Arc'teryx Cerium LT Hoody", subtype: "insulation" },
  // IN = Insulated (Mammut 표기)
  { name: "Mammut Broad Peak IN Hooded Jacket", subtype: "insulation" },
  { name: "Mammut Rime IN Flex Hooded Jacket", subtype: "insulation" },
  { name: "Montbell Permafrost Down Parka", subtype: "insulation" },
  { name: "Montbell Plasma 1000 Down Jacket", subtype: "insulation" },
  { name: "Montbell Superior Down Parka", subtype: "insulation" },
  { name: "Patagonia Down Sweater Jacket", subtype: "insulation" },
  { name: "Patagonia Nano Puff Jacket", subtype: "insulation" },
  { name: "The North Face ThermoBall Eco Jacket", subtype: "insulation" },

  // ── mid-layer — 플리스·소프트셸
  // MX = 소프트셸 라인
  { name: "Arc'teryx Gamma MX Jacket", subtype: "mid-layer" },
  { name: "Columbia Benton Springs Full Zip Fleece Jacket", subtype: "mid-layer" },
  { name: "Columbia Steens Mountain Full Zip 2.0 Fleece Jacket", subtype: "mid-layer" },
  // G-1000 왁스 원단 — 방수막이 없어 셸이 아니다
  { name: "Fjällräven Greenland Jacket", subtype: "mid-layer" },
  // SO = Softshell (Mammut 표기)
  { name: "Mammut Ultimate V SO Hooded Jacket", subtype: "mid-layer" },
  { name: "Patagonia Better Sweater Fleece Jacket", subtype: "mid-layer" },
  { name: "The North Face Denali Jacket", subtype: "mid-layer" },

  // ── pants — 하의
  { name: "Columbia Silver Ridge Convertible Pant", subtype: "pants" },
  { name: "Fjällräven Abisko Trekking Tights", subtype: "pants" },
  { name: "Fjällräven Keb Trousers", subtype: "pants" },
  { name: "Fjällräven Vidda Pro Trousers", subtype: "pants" },
  { name: "Salomon Icemania Pant", subtype: "pants" },
  { name: "Salomon Agile 2in1 Short", subtype: "pants" },

  // ── footwear — 등산화
  { name: "KEEN Targhee III Waterproof Mid Black Olive/Golden Brown", subtype: "footwear" },
  { name: "Merrell Moab 2 Mid Waterproof Earth", subtype: "footwear" },
  { name: "Merrell Moab 2 Vent Mid Walnut", subtype: "footwear" },
  { name: "Merrell Moab 3 Mid Walnut", subtype: "footwear" },
  { name: "Merrell Moab 3 Mid Waterproof Earth", subtype: "footwear" },
];

/** 후보에 잡혔지만 **옮기지 않는 것** — 왜 남기는지 함께 적는다 */
const KEEP: { name: string; why: string }[] = [
  { name: "The North Face 1996 Retro Nuptse Jacket", why: "스트리트웨어 아이콘 — 등산 용도로 팔리지 않는다" },
  { name: "The North Face McMurdo Parka", why: "도시형 방한 파카" },
  { name: "Fjällräven Nuuk Parka", why: "도시형 방한 파카" },
  { name: "KEEN Clearwater CNX Raven/Tortoise Shell", why: "워터 샌들" },
  { name: "KEEN Newport H2 India Ink/Rust", why: "워터 샌들" },
  { name: "KEEN UNEEK Black/Black", why: "라이프스타일 샌들" },
  { name: "KEEN Jasper Cathay Spice/Orion Blue", why: "어프로치 성격이지만 일상 스니커로 팔린다" },
  { name: "Merrell Jungle Moc Gunsmoke", why: "슬립온 캐주얼" },
];

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
    select: { id: true, key: true, labelKo: true },
  });
  const subId = new Map(subs.map((s) => [s.key, s.id]));
  const subLabel = new Map(subs.map((s) => [s.key, s.labelKo]));
  for (const m of MOVES) {
    if (!subId.has(m.subtype)) {
      throw new Error(`등산 종류 '${m.subtype}' 가 없습니다 — setup-hiking-subtypes 를 먼저 돌리세요`);
    }
  }

  // ── 1. 브랜드 연결 ────────────────────────────────────────────────────
  const brands = await prisma.brand.findMany({
    where: { name: { in: BRANDS } },
    select: { id: true, name: true },
  });
  const missingBrands = BRANDS.filter((b) => !brands.some((x) => x.name === b));
  console.log(`① 브랜드 ${brands.length}/${BRANDS.length}건 확인`);
  if (missingBrands.length) console.log(`   ⚠️ 마스터에 없음: ${missingBrands.join(", ")}`);
  if (APPLY) {
    let added = 0;
    for (const b of brands) {
      const before = await prisma.brandScope.findFirst({
        where: { brandId: b.id, categoryId: hiking.id },
        select: { id: true },
      });
      if (before) continue;
      // 카테고리 공통 연결 — 종류로 좁히는 것은 어드민이 나중에 (D-255)
      await prisma.brandScope.create({ data: { brandId: b.id, categoryId: hiking.id } });
      added++;
    }
    console.log(`   등산에 새로 연결 ${added}건`);
  }

  // ── 2. 대상 확인 ──────────────────────────────────────────────────────
  const names = MOVES.map((m) => m.name);
  const found = await prisma.codexItem.findMany({
    where: { displayName: { in: names } },
    select: {
      id: true,
      displayName: true,
      normalizedKey: true,
      categoryId: true,
      category: { select: { key: true } },
    },
  });
  const byName = new Map(found.map((f) => [f.displayName, f]));
  const notFound = names.filter((n) => !byName.has(n));
  console.log(`\n② 대상 ${found.length}/${names.length}건 확인`);
  if (notFound.length) {
    console.log(`   ⚠️ 도감에 없음 ${notFound.length}건:`);
    for (const n of notFound) console.log(`      ${n}`);
  }
  const already = found.filter((f) => f.categoryId === hiking.id);
  if (already.length) console.log(`   이미 등산 ${already.length}건 (건너뜀)`);

  // ── 3. 보유자 확인 — 있으면 멈춘다 ────────────────────────────────────
  const owned = await prisma.item.count({
    where: { codexItemId: { in: found.map((f) => f.id) } },
  });
  if (owned > 0) {
    console.log(`\n⚠️ 대상 도감에 연결된 유저 아이템이 ${owned}건 있습니다.`);
    console.log(`   카테고리를 바꾸면 그 유저의 방 진열이 이동합니다 — 중단합니다.`);
    return;
  }
  console.log(`   보유자 0명 확인`);

  // ── 4. 이관 ───────────────────────────────────────────────────────────
  let moved = 0;
  const clashes: string[] = [];
  const plan = new Map<string, number>();

  for (const m of MOVES) {
    const codex = byName.get(m.name);
    if (!codex || codex.categoryId === hiking.id) continue;
    const targetSub = subId.get(m.subtype)!;

    // 옮길 스코프에 같은 값이 있으면 고르지 않고 남긴다 (D-190)
    const dup = await prisma.codexItem.findFirst({
      where: { scopeId: targetSub, normalizedKey: codex.normalizedKey, id: { not: codex.id } },
      select: { displayName: true },
    });
    if (dup) {
      clashes.push(`${m.name} → ${m.subtype} (충돌: ${dup.displayName})`);
      continue;
    }
    const myKeys = await prisma.codexMatchKey.findMany({
      where: { codexItemId: codex.id },
      select: { value: true },
    });
    const taken = await prisma.codexMatchKey.findFirst({
      where: {
        scopeId: targetSub,
        value: { in: myKeys.map((k) => k.value) },
        codexItemId: { not: codex.id },
      },
      select: { value: true },
    });
    if (taken) {
      clashes.push(`${m.name} → ${m.subtype} (키 충돌: ${taken.value})`);
      continue;
    }

    plan.set(m.subtype, (plan.get(m.subtype) ?? 0) + 1);
    if (!APPLY) {
      moved++;
      continue;
    }
    // ⚠️ 도감·매칭 키를 한 트랜잭션으로. 매칭 키는 categoryId 사본도 바꾼다
    await prisma.$transaction(async (tx) => {
      await tx.codexItem.update({
        where: { id: codex.id },
        data: { categoryId: hiking.id, subtypeId: targetSub },
      });
      await tx.codexMatchKey.updateMany({
        where: { codexItemId: codex.id },
        data: { categoryId: hiking.id, subtypeId: targetSub },
      });
    });
    moved++;
  }

  console.log(`\n③ ${APPLY ? "이관" : "이관 예정"} ${moved}건 · 충돌 ${clashes.length}건`);
  for (const [k, n] of [...plan].sort()) console.log(`   ${subLabel.get(k)} (${k}) ${n}건`);
  for (const c of clashes) console.log(`   ⚠️ ${c}`);

  console.log(`\n④ 남기는 것 ${KEEP.length}건 — 옮기지 않는 이유가 있다`);
  for (const k of KEEP) console.log(`   ${k.name} — ${k.why}`);

  if (APPLY) {
    const mismatch = await prisma.codexMatchKey.count({
      where: { codexItem: { categoryId: hiking.id }, categoryId: { not: hiking.id } },
    });
    const unclassified = await prisma.codexItem.count({
      where: { categoryId: hiking.id, subtypeId: null, mergedIntoId: null },
    });
    const total = await prisma.codexItem.count({ where: { categoryId: hiking.id } });
    console.log(`\n검산 — 등산 도감 ${total}건`);
    console.log(`       매칭 키 categoryId 어긋남 ${mismatch}건 (0이어야 함)`);
    console.log(`       종류 없는 등산 도감 ${unclassified}건 (0이어야 함 — subtypeRequired)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
