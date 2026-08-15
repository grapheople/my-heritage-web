import "./env";
import { describeDatabase, runtimeDatabaseUrl } from "../src/lib/db-url";
import { prisma } from "../src/lib/prisma";

/**
 * 캠핑 도감에 섞여 들어간 **의류·신발**을 걷어낸다 (D-216 · OI-101).
 *
 * ## ⚠️ 무엇이 잘못됐나
 * 캠핑 223건 중 19건이 옷·신발이었다 — `Arc'teryx Alpha SV Jacket`,
 * `Patagonia Down Sweater Jacket`, `Merrell Trail Glove 7`. 옷·캠핑 **겸업
 * 브랜드가 10개**인데 그 브랜드에서 **가장 유명한 것이 옷**이라, "대표 제품
 * 5개"라는 힌트가 옷을 가져왔다. 원인은 `research-codex.ts` 의 힌트에서 막았다.
 *
 * ## ⚠️ 왜 옮기지 않고 지우는가
 * 처음에는 "카테고리 이동 경로가 없어서 못 고친다"고 판단했다. 실제로 이동은
 * 간단하지 않다 — `normalizedKey` 유일성 범위가 카테고리이고(D-014)
 * `CodexMatchKey.categoryId` 가 그 사본이라, 도감만 옮기고 키를 두면 **매칭으로
 * 닿지 않는 도감**이 된다 (D-197).
 *
 * 그런데 **옮길 필요가 없다.** 옷 카테고리를 제대로 시딩하면 같은 물건이 정상
 * 경로로 생기고(`insertCodex` → 브랜드 게이트 → PRIMARY 키까지), 캠핑 쪽은
 * **아이템이 0개 붙어 있어** 그냥 지우면 된다. 이동 경로를 새로 만드는 것보다
 * **이미 있는 등록 경로를 쓰는 것**이 규칙이 갈릴 여지가 없다 (D-197 의 태도).
 *
 * ## ⚠️ 갈 곳이 없으면 지우지 않는다 — 이 스크립트의 핵심 가드
 * 옷·신발 카테고리에 **같은 명칭이 이미 있는 것만** 지운다. 없는 것은 지우지
 * 않고 보고한다 — 지우면 그 물건이 도감에서 통째로 사라진다. 그런 항목은
 * 해당 카테고리를 먼저 시딩해야 한다는 뜻이다.
 *
 * 나머지 두 가드: **연결된 아이템이 0건**이어야 하고(남의 방에서 정보가
 * 사라지면 안 된다), **미검증**이어야 한다(사람이 확인한 것은 건드리지 않는다).
 *
 * ⚠️ 되돌릴 수 있다 — `prisma/codex.json` 이 삭제 이전 상태를 담고 있다면
 * `db:import-codex` 로 복원된다. **지우기 전에 export 를 떠 두는 것이 맞다.**
 *
 * ```
 * pnpm db:fix-camping-mix --dry-run   # 먼저 이걸로 돌린다
 * pnpm db:fix-camping-mix
 * ```
 */

/**
 * 걷어낼 후보를 찾는 검색어.
 *
 * ⚠️ **명칭을 하드코딩하지 않는다.** 19건을 그대로 박으면 다음에 같은 일이
 * 생겼을 때 이 스크립트가 아무것도 못 잡는다. 다만 검색어는 넓게 잡고
 * **판정은 가드가 한다** — 넓게 잡아도 갈 곳이 없으면 지우지 않는다.
 */
const WEAR = [
  "Jacket", "Hoody", "Hoodie", "Fleece", "Sweater", "Parka", "Vest", "Anorak",
  "Shirt", "Pants", "Shorts", "Glove", "Beanie",
  "Boot", "Shoe", "Sneaker",
];

async function main() {
  console.log(`대상 DB — ${describeDatabase(runtimeDatabaseUrl())}`);
  const dryRun = process.argv.includes("--dry-run");

  const [camping, apparel, shoes] = await Promise.all([
    prisma.category.findUnique({ where: { key: "camping" }, select: { id: true } }),
    prisma.category.findUnique({ where: { key: "apparel" }, select: { id: true } }),
    prisma.category.findUnique({ where: { key: "shoes" }, select: { id: true } }),
  ]);
  if (!camping || !apparel || !shoes) throw new Error("카테고리를 찾을 수 없습니다");

  const candidates = await prisma.codexItem.findMany({
    where: {
      categoryId: camping.id,
      mergedIntoId: null,
      OR: WEAR.map((w) => ({ displayName: { contains: w } })),
    },
    select: {
      id: true, displayName: true, verification: true,
      _count: { select: { items: true } },
    },
    orderBy: { displayName: "asc" },
  });

  const removable: { id: string; displayName: string; where: string }[] = [];
  /** ⚠️ 조용히 넘기지 않는다 — 왜 남겼는지 모르면 다음에 또 센다 */
  const kept: string[] = [];

  for (const c of candidates) {
    if (c._count.items > 0) {
      kept.push(`${c.displayName} — 아이템 ${c._count.items}건이 연결돼 있다`);
      continue;
    }
    if (c.verification !== "UNVERIFIED") {
      kept.push(`${c.displayName} — 검증된 도감이다. 사람이 확인한 것은 건드리지 않는다`);
      continue;
    }
    const home = await prisma.codexItem.findFirst({
      where: {
        categoryId: { in: [apparel.id, shoes.id] },
        displayName: c.displayName,
        mergedIntoId: null,
      },
      select: { category: { select: { key: true } } },
    });
    if (!home) {
      kept.push(`${c.displayName} — 옷·신발에 같은 명칭이 없다. **먼저 그 카테고리를 시딩해야 한다**`);
      continue;
    }
    removable.push({ id: c.id, displayName: c.displayName, where: home.category.key });
  }

  console.log(`\n캠핑 의류·신발 후보 ${candidates.length}건`);
  console.log(`  걷어낼 수 있다 ${removable.length}건 · 남긴다 ${kept.length}건`);
  for (const r of removable) console.log(`  − ${r.displayName}  → ${r.where} 에 이미 있다`);
  if (kept.length > 0) {
    console.log(`\n남기는 이유:`);
    for (const k of kept) console.log(`  · ${k}`);
  }

  if (dryRun) {
    console.log(`\n[dry-run] DB 를 건드리지 않았습니다`);
    return;
  }
  if (removable.length === 0) {
    console.log(`\n지울 것이 없습니다`);
    return;
  }

  // `CodexMatchKey` 는 `onDelete: Cascade` 라 함께 사라진다
  const { count } = await prisma.codexItem.deleteMany({
    where: { id: { in: removable.map((r) => r.id) } },
  });
  console.log(`\n삭제 ${count}건`);
  console.log(`남은 캠핑 도감 ${await prisma.codexItem.count({ where: { categoryId: camping.id } })}건`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
