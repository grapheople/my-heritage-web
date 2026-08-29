import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { localizeCodexNames } from "../src/lib/bot/claude";
import { categoryLabelKo } from "../src/lib/category-label";

/**
 * 기존 도감의 표시명을 **한국어·일본어로 채운다** (D-279).
 *
 * ## ⚠️ D-277·D-278 의 "비워두는 것이 기본" 을 PM 이 뒤집었다
 * 그 둘은 *"라틴 원문은 채울 이유가 없다 — 컬렉터는 원문으로 부른다"* (D-009)
 * 를 근거로 비우는 것을 기본값으로 뒀다. **PM 지시로 전건을 채운다.**
 *
 * 남는 위험은 그대로다: 통용 표기가 없는 제품은 **음차**가 되고, 음차는
 * 컬렉터가 실제로 쓰지 않는 이름일 수 있다. 그래서:
 * - 검증 상태를 **건드리지 않는다** (D-269)
 * - 이미 값이 있으면 **덮지 않는다** — 사람이 고친 것을 되돌리면 안 된다
 * - A-04 상세에서 언제든 고칠 수 있다 (D-277)
 *
 * ## ⚠️ 고유번호가 망가지는 것을 코드가 검산한다
 * `126610LN` → `126610엘엔` 이 되면 **유저가 자기 시계를 못 알아본다.**
 * 프롬프트가 금지하지만 그것만 믿지 않는다 — 원문에서 뽑은 **식별자 토큰이
 * 결과에 그대로 남아 있는지** 확인하고, 없으면 그 행을 버린다.
 *
 * ⚠️ **원문과 같은 값은 저장하지 않는다.** 어차피 원문으로 떨어지므로 행만
 * 늘어난다 (`sanitizeCodexCandidates` 와 같은 규칙 — D-278).
 *
 * ## ⚠️ 운동은 매번 헛돈다 — `--category=` 로 빼고 돌릴 것
 * 대상 조건이 `nameKo IS NULL OR nameJa IS NULL` 인데 운동 111건은 **원문이
 * 이미 한국어**(`바벨 벤치프레스`)라 `nameKo` 가 영원히 `null` 이다. 저장 규칙이
 * "원문과 같으면 저장하지 않는다" 이기 때문이고, 그것이 옳다 — 비어도 원문으로
 * 떨어져 결과가 같다.
 *
 * 전체 실행마다 **5회 호출을 쓰고 0건을 채운다.** "시도했음" 을 기억하는 컬럼을
 * 두는 것은 5회를 아끼자고 스키마를 늘리는 것이라 하지 않는다.
 *
 * ```
 * pnpm tsx prisma/localize-codex.ts                    # 미리보기 (1배치)
 * pnpm tsx prisma/localize-codex.ts --category=watch   # 카테고리 한정
 * pnpm tsx prisma/localize-codex.ts --apply            # 전건 적용
 * ```
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes("--apply");
const ONLY = process.argv.find((a) => a.startsWith("--category="))?.split("=")[1];
/** 한 번에 묶는 건수. 25 는 `classify-codex` 에서 안정적으로 돌던 값이다 */
const BATCH = 25;

/**
 * 원문에서 **제품 코드로 보이는 토큰**을 뽑는다.
 *
 * ## ⚠️ 초판은 너무 넓게 잡아 정상 번역을 버렸다
 * *"숫자 + 글자가 섞인 3자 이상"* 으로 잡았더니 **읽는 부분**까지 코드로 봤다:
 * `Chapter2`→`챕터2` · `6-Inch`→`6인치` · `2-Burner`→`2버너` · `Sk8-Hi` ·
 * `Wave:3` — 전부 옮기는 게 맞는 것들인데 19건이 버려졌다.
 *
 * ## 코드는 **대문자·숫자·구분자만**으로 이뤄진다
 * `126610LN` · `M-5545` · `UG-43` · `DD1391-100` · `235.026` · `CB-ODX-1`.
 * 소문자가 섞이면 읽는 말이지 코드가 아니다.
 *
 * ⚠️ 순수 숫자(`3`·`2023`)와 2자 이하(`3T`·`NX`)는 뺀다 — `カマボコテント3` 의
 * `3` 까지 강제하면 정당한 번역이 전부 걸린다.
 */
function identifierTokens(name: string): string[] {
  return name
    .split(/[\s·,()（）〈〉[\]]+/)
    .map((t) => t.trim())
    // 대문자·숫자·구분자만 · 3자 이상 · 숫자를 포함
    .filter((t) => t.length >= 3 && /\d/.test(t) && /^[A-Z0-9][A-Z0-9\-./]*$/.test(t));
}

/** 식별자가 결과에 살아 있나 — 대소문자만 무시한다 */
function keepsIdentifiers(original: string, translated: string): string[] {
  const lost: string[] = [];
  const t = translated.toLowerCase();
  for (const tok of identifierTokens(original)) {
    if (!t.includes(tok.toLowerCase())) lost.push(tok);
  }
  return lost;
}

type Row = { id: string; displayName: string; nameKo: string | null; nameJa: string | null };

async function runCategory(categoryKey: string, rows: Row[]) {
  const label = await categoryLabelKo(categoryKey);
  const batches = Math.ceil(rows.length / BATCH);
  console.log(`\n── ${label}(${categoryKey}) ${rows.length}건 · ${batches}회 호출`);

  let filled = 0;
  let skippedSame = 0;
  const broken: string[] = [];
  const missed: string[] = [];

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const n = Math.floor(i / BATCH) + 1;
    let out;
    try {
      out = await localizeCodexNames({
        categoryLabel: label,
        items: chunk.map((c) => ({ id: c.id, displayName: c.displayName })),
      });
    } catch (e) {
      console.log(`  [${n}/${batches}] ⚠️ 실패 — ${(e as Error).message}`);
      continue;
    }

    const byId = new Map(out.map((o) => [o.id, o]));
    let batchFilled = 0;

    for (const row of chunk) {
      const o = byId.get(row.id);
      if (!o) {
        missed.push(row.displayName);
        continue;
      }
      const data: Record<string, string> = {};

      for (const [lang, field, current] of [
        ["ko", "nameKo", row.nameKo],
        ["ja", "nameJa", row.nameJa],
      ] as const) {
        // 이미 있으면 덮지 않는다 — 사람이 고친 것을 되돌리면 안 된다
        if (current) continue;
        const v = o[lang];
        if (!v) continue;
        // 원문과 같으면 저장하지 않는다 — 어차피 원문으로 떨어진다 (D-278)
        if (v === row.displayName) {
          skippedSame++;
          continue;
        }
        // ⚠️ 고유번호가 망가졌으면 버린다
        const lost = keepsIdentifiers(row.displayName, v);
        if (lost.length > 0) {
          broken.push(`${row.displayName} → ${v} (${lang}: ${lost.join(",")} 유실)`);
          continue;
        }
        data[field] = v;
      }

      if (Object.keys(data).length === 0) continue;
      if (APPLY) await prisma.codexItem.update({ where: { id: row.id }, data });
      batchFilled++;
    }

    filled += batchFilled;
    console.log(`  [${n}/${batches}] ${chunk.length}건 요청 · ${out.length}건 응답 · ${batchFilled}건 채움`);
    if (!APPLY) {
      console.log("  (미리보기 — 첫 배치만 돌립니다. --apply 로 전건)");
      for (const row of chunk.slice(0, 5)) {
        const o = byId.get(row.id);
        console.log(`     ${row.displayName}\n        ko: ${o?.ko || "(없음)"}\n        ja: ${o?.ja || "(없음)"}`);
      }
      break;
    }
  }

  if (broken.length) {
    console.log(`  ⚠️ 고유번호 유실로 버린 것 ${broken.length}건`);
    for (const b of broken.slice(0, 5)) console.log(`     · ${b}`);
  }
  if (missed.length) console.log(`  ⚠️ 모델이 빠뜨린 것 ${missed.length}건 — 다시 돌리면 채워진다`);
  if (skippedSame) console.log(`  원문과 같아 건너뜀 ${skippedSame}건`);
  return filled;
}

async function main() {
  console.log(`대상 DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}`);
  console.log(APPLY ? "모드: 적용" : "모드: 미리보기 (--apply 로 적용)");

  const all = await prisma.codexItem.findMany({
    where: {
      OR: [{ nameKo: null }, { nameJa: null }],
      ...(ONLY ? { category: { key: ONLY } } : {}),
    },
    select: { id: true, displayName: true, nameKo: true, nameJa: true, category: { select: { key: true } } },
    orderBy: { displayName: "asc" },
  });

  const byCat = new Map<string, Row[]>();
  for (const r of all) {
    const k = r.category.key;
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push({ id: r.id, displayName: r.displayName, nameKo: r.nameKo, nameJa: r.nameJa });
  }
  console.log(`대상 ${all.length}건 · 카테고리 ${byCat.size}개`);

  let total = 0;
  for (const [key, rows] of byCat) total += await runCategory(key, rows);

  console.log(`\n── ${APPLY ? "채움" : "채울 것"} ${total}건`);

  if (APPLY) {
    const left = await prisma.codexItem.count({ where: { OR: [{ nameKo: null }, { nameJa: null }] } });
    const done = await prisma.codexItem.count({ where: { nameKo: { not: null }, nameJa: { not: null } } });
    console.log(`검산 — 둘 다 채워진 도감 ${done}건 · 아직 빈 것 ${left}건`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
