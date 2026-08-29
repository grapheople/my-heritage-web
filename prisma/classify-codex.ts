import { readFile, writeFile } from "node:fs/promises";
import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { classifyCodexItems } from "../src/lib/bot/claude";
import { categoryLabelKo } from "../src/lib/category-label";
import { describeDatabase, migrationDatabaseUrl } from "../src/lib/db-url";

/**
 * 기존 도감을 **종류로 분류한다** (D-257).
 *
 * ## ⚠️ 두 단계다 — 제안과 적용을 분리한다
 * ```
 * pnpm tsx prisma/classify-codex.ts camping           # 제안 파일 생성
 * pnpm tsx prisma/classify-codex.ts camping --apply   # 검토 후 적용
 * ```
 *
 * 사람이 확인하지 않은 AI 출력을 DB 에 바로 넣지 않는다 (D-185 와 같은 태도).
 * **오분류는 조용히 망가진다** — 잘못된 종류로 들어가면 유저 아이템과 만나지
 * 않는데 화면상으로는 정상으로 보인다. 수집(`research-codex`)은 틀리면 도감이
 * 하나 늘 뿐이지만, 분류는 **있던 연결을 끊는다.**
 *
 * ## ⚠️ `unknown` 은 실패가 아니라 검출 신호다
 * 어느 종류에도 안 맞는 것은 대개 애초에 그 카테고리가 아니다 — 캠핑에
 * 부츠·로프·헬멧이 섞여 있었다 (D-216). 적용 단계에서 `unknown` 은 **건너뛴다.**
 *
 * ## ⚠️ 적용은 매칭 키를 함께 옮긴다
 * 도감만 옮기면 매칭 키가 옛 스코프에 남아 갈리고, 옮긴 도감을 매칭이 영원히
 * 못 찾는다 (D-256 에서 확인한 함정).
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** 한 번에 모델에게 주는 건수. 너무 크면 응답이 잘리고 작으면 호출이 잦다 */
const BATCH = 25;

type Row = {
  id: string;
  displayName: string;
  subtype: string;
  confidence: string;
  note: string;
};

function outPath(categoryKey: string) {
  return `prisma/data/classify-${categoryKey}.csv`;
}

const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;

async function propose(categoryKey: string) {
  const cat = await prisma.category.findUnique({
    where: { key: categoryKey },
    select: { id: true },
  });
  if (!cat) return console.log(`⚠️ 카테고리 '${categoryKey}' 가 없습니다`);

  const subtypes = await prisma.categorySubtype.findMany({
    where: { categoryId: cat.id, active: true },
    orderBy: { displayOrder: "asc" },
    select: { key: true, labelKo: true },
  });
  if (subtypes.length === 0) {
    return console.log(`⚠️ '${categoryKey}' 에 종류가 없습니다 — 분류할 축이 없습니다`);
  }

  const items = await prisma.codexItem.findMany({
    where: { categoryId: cat.id, subtypeId: null, mergedIntoId: null },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true },
  });
  if (items.length === 0) return console.log("미분류 도감이 없습니다");

  const label = await categoryLabelKo(categoryKey);
  console.log(`${label}(${categoryKey}) · 미분류 ${items.length}건 · 종류 ${subtypes.length}개`);
  console.log(`배치 ${BATCH}건씩 ${Math.ceil(items.length / BATCH)}회 호출\n`);

  const rows: Row[] = [];
  const nameOf = new Map(items.map((i) => [i.id, i.displayName]));

  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    const n = Math.floor(i / BATCH) + 1;
    try {
      const out = await classifyCodexItems({
        categoryLabel: label,
        subtypes: subtypes.map((s) => ({ key: s.key, label: s.labelKo })),
        items: chunk,
      });
      for (const r of out) {
        rows.push({ ...r, displayName: nameOf.get(r.id) ?? "" });
      }
      const unknown = out.filter((r) => r.subtype === "unknown").length;
      console.log(`[${n}] ${chunk.length}건 요청 · ${out.length}건 응답 · unknown ${unknown}`);
      /*
        ⚠️ **빠진 건수를 조용히 넘기지 않는다.** 응답이 요청보다 적으면 모델이
        일부를 빠뜨린 것이다 — 그대로 두면 그 도감은 제안 파일에 없어서
        영원히 미분류로 남는다 (D-188 이 "제외 사유를 버려서" 원인을 두 번
        잘못 짚은 것과 같은 유형)
      */
      if (out.length < chunk.length) {
        const got = new Set(out.map((r) => r.id));
        for (const c of chunk) {
          if (!got.has(c.id)) {
            rows.push({
              id: c.id,
              displayName: c.displayName,
              subtype: "unknown",
              confidence: "low",
              note: "모델 응답에서 누락됨",
            });
          }
        }
        console.log(`    ⚠️ ${chunk.length - out.length}건 누락 → unknown 으로 기록`);
      }
    } catch (e) {
      // 한 배치의 실패가 전체를 멈추지 않는다
      console.log(`[${n}] ⚠️ 실패 — ${(e as Error).message}`);
      for (const c of chunk) {
        rows.push({
          id: c.id,
          displayName: c.displayName,
          subtype: "unknown",
          confidence: "low",
          note: "조사 실패",
        });
      }
    }
  }

  const header = "id,displayName,subtype,confidence,note";
  const csv = [
    header,
    ...rows.map((r) =>
      [r.id, r.displayName, r.subtype, r.confidence, r.note].map(cell).join(","),
    ),
  ].join("\n");
  await writeFile(outPath(categoryKey), csv + "\n", "utf-8");

  const byConf = (c: string) => rows.filter((r) => r.confidence === c).length;
  const unknown = rows.filter((r) => r.subtype === "unknown");
  console.log(`\n제안 ${rows.length}건 → ${outPath(categoryKey)}`);
  console.log(`  high ${byConf("high")} · medium ${byConf("medium")} · low ${byConf("low")}`);
  console.log(`  unknown ${unknown.length}건 — 이 카테고리 제품이 아닐 수 있습니다 (D-216)`);
  for (const u of unknown.slice(0, 10)) {
    console.log(`    · ${u.displayName}${u.note ? ` — ${u.note}` : ""}`);
  }
  console.log(`\n⚠️ 파일을 훑고 고친 뒤 --apply 로 적용하세요. unknown 은 건너뜁니다.`);
}

async function apply(categoryKey: string) {
  const raw = await readFile(outPath(categoryKey), "utf-8").catch(() => "");
  if (!raw) return console.log(`⚠️ ${outPath(categoryKey)} 가 없습니다 — 먼저 제안을 만드세요`);

  const lines = raw.trim().split("\n").slice(1);
  const parsed = lines.map((l) => {
    const cells = l.match(/"((?:[^"]|"")*)"/g)?.map((c) => c.slice(1, -1).replace(/""/g, '"')) ?? [];
    return { id: cells[0], subtype: cells[2] };
  });

  const cat = await prisma.category.findUnique({
    where: { key: categoryKey },
    select: { id: true },
  });
  if (!cat) return console.log(`⚠️ 카테고리 '${categoryKey}' 가 없습니다`);
  const subtypes = await prisma.categorySubtype.findMany({
    where: { categoryId: cat.id },
    select: { id: true, key: true, active: true },
  });
  const idOf = new Map(subtypes.filter((s) => s.active).map((s) => [s.key, s.id]));

  let moved = 0;
  let skipped = 0;
  const clashes: string[] = [];

  for (const p of parsed) {
    if (!p.id || !p.subtype || p.subtype === "unknown") {
      skipped++;
      continue;
    }
    const subtypeId = idOf.get(p.subtype);
    if (!subtypeId) {
      skipped++;
      continue;
    }
    const codex = await prisma.codexItem.findUnique({
      where: { id: p.id },
      select: { id: true, displayName: true, normalizedKey: true, subtypeId: true },
    });
    if (!codex || codex.subtypeId) {
      skipped++;
      continue;
    }

    // ⚠️ 옮길 스코프에 같은 값이 있으면 고르지 않고 남긴다 (D-190)
    const clash = await prisma.codexItem.findFirst({
      where: { scopeId: subtypeId, normalizedKey: codex.normalizedKey, id: { not: codex.id } },
      select: { displayName: true },
    });
    if (clash) {
      clashes.push(`${codex.displayName} → ${p.subtype} (충돌: ${clash.displayName})`);
      continue;
    }

    // ⚠️ 도감과 매칭 키를 함께 (D-256)
    await prisma.$transaction(async (tx) => {
      await tx.codexItem.update({ where: { id: codex.id }, data: { subtypeId } });
      await tx.codexMatchKey.updateMany({ where: { codexItemId: codex.id }, data: { subtypeId } });
    });
    moved++;
  }

  const left = await prisma.codexItem.count({
    where: { categoryId: cat.id, subtypeId: null, mergedIntoId: null },
  });
  console.log(`적용 ${moved}건 · 건너뜀 ${skipped}건 · 충돌 ${clashes.length}건`);
  for (const c of clashes) console.log(`  ⚠️ ${c}`);
  console.log(`남은 미분류: ${left}건`);
}

async function main() {
  const argv = process.argv.slice(2);
  const categoryKey = argv.find((a) => !a.startsWith("--"));
  if (!categoryKey) {
    console.log("사용법: pnpm tsx prisma/classify-codex.ts <카테고리> [--apply]");
    return;
  }
  console.log(`대상 DB — ${describeDatabase(migrationDatabaseUrl())}`);
  if (argv.includes("--apply")) await apply(categoryKey);
  else await propose(categoryKey);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
