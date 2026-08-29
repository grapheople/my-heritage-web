import { readFile } from "node:fs/promises";
import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * 캠핑 도감 중 **배낭·등반장비**를 등산으로 옮긴다 (D-260).
 *
 * ## ⚠️ 카테고리를 넘는 이관이다 — `setCodexSubtype` 으로는 안 된다
 * 그 액션은 같은 카테고리 안에서만 옮긴다. 여기서는 `categoryId` 가 바뀌므로
 * 함께 움직여야 하는 것이 늘어난다:
 * - `CodexItem.categoryId` + `subtypeId`
 * - `CodexMatchKey` 의 **두 사본** (`categoryId`·`subtypeId`)
 * - 옮길 스코프의 유일성 재판정 (`normalizedKey` ∪ 키 alias)
 * - **연결된 유저 아이템의 `categoryId`**
 *
 * ## ⚠️ 보유자가 있으면 멈춘다
 * 유저 아이템의 카테고리를 말없이 바꾸면 **그 유저의 방 진열이 이동한다.**
 * 지금 대상 30건의 보유자는 0명이라 무해하지만, 확인하지 않고 넘어가면
 * 다음에 같은 스크립트를 돌릴 때 조용히 옮긴다.
 *
 * ## ⚠️ 브랜드 연결이 먼저다
 * 등산에 브랜드가 붙어 있지 않으면 그 카테고리 등록 폼에서 브랜드를 고를 수
 * 없다 (D-044). 도감만 옮기고 브랜드를 안 옮기면 **유저가 그 도감에 닿는
 * 경로가 없다.**
 *
 * ## ⚠️ 범용 카테고리 이동 UI 를 만들지 않는다
 * D-216 이 "간단하지 않다"고 판단해 `db:fix-camping-mix` 가 옮기지 않고 지운
 * 그 작업이다. 일회성 스크립트로 둔다.
 *
 * ```
 * pnpm tsx prisma/migrate-camping-to-hiking.ts          # 미리보기
 * pnpm tsx prisma/migrate-camping-to-hiking.ts --apply
 * ```
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes("--apply");

/** 이관 대상 판정에 쓰는 note 키워드 — 분류 제안 CSV 의 `note` 를 본다 */
const BACKPACK = ["배낭", "백팩", "가방", "더플"];
const CLIMBING = ["로프", "하네스", "헬멧", "빌레이", "확보기", "비콘", "클라이밍", "등반"];

/** 이관 대상 브랜드 — 분류 결과에서 실제로 나온 것만 (추측하지 않는다) */
const BRANDS = [
  "Deuter",
  "Gregory",
  "Mammut",
  "Osprey",
  "Hyperlite Mountain Gear",
  "Fjällräven",
  "Zpacks",
  "Arc'teryx",
  "Patagonia",
];

async function main() {
  console.log(`대상 DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}`);
  console.log(APPLY ? "모드: 적용\n" : "모드: 미리보기 (--apply 로 적용)\n");

  const [camping, hiking] = await Promise.all([
    prisma.category.findUnique({ where: { key: "camping" }, select: { id: true } }),
    prisma.category.findUnique({ where: { key: "hiking" }, select: { id: true } }),
  ]);
  if (!camping) throw new Error("캠핑 카테고리가 없습니다");
  if (!hiking) throw new Error("등산 카테고리가 없습니다 — setup-hiking-category 를 먼저 돌리세요");

  const subs = await prisma.categorySubtype.findMany({
    where: { categoryId: hiking.id },
    select: { id: true, key: true },
  });
  const backpackId = subs.find((s) => s.key === "backpack")?.id;
  const climbingId = subs.find((s) => s.key === "climbing")?.id;
  if (!backpackId || !climbingId) throw new Error("등산 종류가 없습니다");

  // ── 1. 브랜드 연결 ────────────────────────────────────────────────────
  const brands = await prisma.brand.findMany({
    where: { name: { in: BRANDS } },
    select: { id: true, name: true },
  });
  const missing = BRANDS.filter((b) => !brands.some((x) => x.name === b));
  console.log(`① 브랜드 ${brands.length}/${BRANDS.length}건 확인`);
  if (missing.length) console.log(`   ⚠️ 마스터에 없음: ${missing.join(", ")}`);

  if (APPLY) {
    for (const b of brands) {
      await prisma.brandScope.upsert({
        where: { brandId_scopeId: { brandId: b.id, scopeId: hiking.id } },
        update: {},
        // 카테고리 공통 연결 — 종류로 좁히는 것은 어드민이 나중에 (D-255)
        create: { brandId: b.id, categoryId: hiking.id },
      });
    }
    console.log(`   등산에 ${brands.length}건 연결`);
  }

  // ── 2. 이관 대상 선정 ─────────────────────────────────────────────────
  const csv = await readFile("prisma/data/classify-camping.csv", "utf-8").catch(() => "");
  if (!csv) throw new Error("classify-camping.csv 가 없습니다 — 먼저 분류를 돌리세요");

  const targets: { id: string; name: string; subtypeId: string; kind: string }[] = [];
  for (const line of csv.trim().split("\n").slice(1)) {
    const c = line.match(/"((?:[^"]|"")*)"/g)?.map((x) => x.slice(1, -1).replace(/""/g, '"')) ?? [];
    const [id, name, subtype, , note] = c;
    if (subtype !== "unknown") continue;
    if (BACKPACK.some((k) => note?.includes(k))) {
      targets.push({ id, name, subtypeId: backpackId, kind: "배낭" });
    } else if (CLIMBING.some((k) => note?.includes(k))) {
      targets.push({ id, name, subtypeId: climbingId, kind: "등반장비" });
    }
  }
  console.log(`\n② 이관 대상 ${targets.length}건`);

  // ── 3. 보유자 확인 — 있으면 멈춘다 ────────────────────────────────────
  const owned = await prisma.item.count({
    where: { codexItemId: { in: targets.map((t) => t.id) } },
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

  for (const t of targets) {
    const codex = await prisma.codexItem.findUnique({
      where: { id: t.id },
      select: { id: true, normalizedKey: true, categoryId: true },
    });
    if (!codex || codex.categoryId !== camping.id) continue;

    // 옮길 스코프에 같은 값이 있으면 고르지 않고 남긴다 (D-190)
    const dup = await prisma.codexItem.findFirst({
      where: { scopeId: t.subtypeId, normalizedKey: codex.normalizedKey, id: { not: codex.id } },
      select: { displayName: true },
    });
    if (dup) {
      clashes.push(`${t.name} → ${t.kind} (충돌: ${dup.displayName})`);
      continue;
    }
    const myKeys = await prisma.codexMatchKey.findMany({
      where: { codexItemId: codex.id },
      select: { value: true },
    });
    const taken = await prisma.codexMatchKey.findFirst({
      where: {
        scopeId: t.subtypeId,
        value: { in: myKeys.map((k) => k.value) },
        codexItemId: { not: codex.id },
      },
      select: { value: true },
    });
    if (taken) {
      clashes.push(`${t.name} → ${t.kind} (키 충돌: ${taken.value})`);
      continue;
    }

    if (!APPLY) {
      moved++;
      continue;
    }
    // ⚠️ 도감·매칭 키를 한 트랜잭션으로. 매칭 키는 categoryId 사본도 바꾼다
    await prisma.$transaction(async (tx) => {
      await tx.codexItem.update({
        where: { id: codex.id },
        data: { categoryId: hiking.id, subtypeId: t.subtypeId },
      });
      await tx.codexMatchKey.updateMany({
        where: { codexItemId: codex.id },
        data: { categoryId: hiking.id, subtypeId: t.subtypeId },
      });
    });
    moved++;
  }

  console.log(`\n③ ${APPLY ? "이관" : "이관 예정"} ${moved}건 · 충돌 ${clashes.length}건`);
  for (const c of clashes) console.log(`   ⚠️ ${c}`);

  if (APPLY) {
    const mismatch = await prisma.codexMatchKey.count({
      where: { codexItem: { categoryId: hiking.id }, categoryId: { not: hiking.id } },
    });
    const left = await prisma.codexItem.count({
      where: { categoryId: camping.id, subtypeId: null, mergedIntoId: null },
    });
    console.log(`\n검산 — 매칭 키 categoryId 어긋남 ${mismatch}건 (0이어야 함)`);
    console.log(`       캠핑 미분류 잔여 ${left}건`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
