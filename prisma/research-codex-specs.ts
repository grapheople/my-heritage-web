import "./env";
import { researchCodexSpecs } from "../src/lib/bot/claude";
import { categoryLabelKo } from "../src/lib/category-label";
import { specFieldsFor, writeCodexSpecs, type SpecField } from "../src/lib/data/codex-spec";
import { describeDatabase, migrationDatabaseUrl } from "../src/lib/db-url";
import { prisma } from "../src/lib/prisma";

/**
 * **이미 있는 도감의 스펙을 채운다** — 배치 조사 (D-313).
 *
 * ## ⚠️ 브랜드별 재조사로는 안 된다
 * `db:research-codex` 는 브랜드마다 "대표 제품 N개" 를 새로 찾아온다. 이미
 * 있는 도감 2,298건의 빈 칸을 채우려면 **그 도감들을 직접 물어야** 한다 —
 * 브랜드 조사는 같은 제품을 다시 찾아오길 기대하는 셈이라 새는 것이 많다.
 *
 * ## ⚠️ 스코프 단위로 묶어 묻는다
 * 스펙 항목은 **카테고리·종류마다 다르다.** 텐트에 러그 폭을 물을 수 없다.
 * 그래서 같은 스코프의 도감을 모아 한 번에 묻고, 프롬프트에는 **그 스코프의
 * 스펙 목록만** 넣는다.
 *
 * ## ⚠️ 이미 채워진 도감은 건너뛴다
 * 기본은 **스펙이 하나도 없는 도감**만 대상이다. CLI 호출이 건당 수십 초라
 * 다시 묻는 비용이 크다. `--refill` 로 전부 다시 물을 수 있다 —
 * `RESEARCH` 는 `ADMIN` 을 덮지 않으므로(D-312) 재실행이 안전하다.
 *
 * ## ⚠️ 로컬 전용이다 (D-146·D-185)
 * `claude` CLI 를 부른다. 프로덕션 런타임에는 그 바이너리가 없다 — 다만 **대상
 * DB 는 환경 변수를 따른다.** 어디에 쓰는지 먼저 출력한다 (D-116).
 *
 * ```
 * pnpm tsx prisma/research-codex-specs.ts --category=shoes            # 미리보기
 * pnpm tsx prisma/research-codex-specs.ts --category=shoes --apply
 * pnpm tsx prisma/research-codex-specs.ts --category=hiking --subtype=shell --limit=60 --apply
 * ```
 */
const APPLY = process.argv.includes("--apply");
const REFILL = process.argv.includes("--refill");
const arg = (k: string) =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const CATEGORY = arg("category");
const SUBTYPE = arg("subtype");
/** 한 번 호출에 묻는 제품 수. 늘리면 응답이 길어져 잘리고, 줄이면 호출이 는다 */
const BATCH = Number(arg("batch")) || 12;
/** 이번 실행에서 다룰 도감 수 상한 — 한 번에 다 돌리면 몇 시간이 걸린다 */
const LIMIT = Number(arg("limit")) || 120;

/** 프롬프트에 넣을 스펙 목록 */
function specParts(fields: SpecField[]): string {
  return fields
    .map((f) => {
      const unit = f.unit ? ` (단위 ${f.unit})` : "";
      const opts = f.options.length
        ? ` — 허용 키: \`${f.options.map((o) => o.key).join("` `")}\``
        : "";
      const kind =
        f.type === "number" ? "숫자" : f.type === "boolean" ? "예/아니오" : f.type === "text" ? "짧은 글" : "선택";
      return `- \`${f.key}\` — **${f.label}** (${kind})${unit}${opts}`;
    })
    .join("\n");
}

async function main() {
  console.log(`대상 DB — ${describeDatabase(migrationDatabaseUrl())}`);
  console.log(APPLY ? "모드: 적용" : "모드: 미리보기 (--apply 로 적용)");

  if (!CATEGORY) {
    console.log("사용법: --category=<키> [--subtype=<키>] [--limit=N] [--batch=N] [--refill] [--apply]");
    return;
  }

  const category = await prisma.category.findUnique({
    where: { key: CATEGORY },
    select: { id: true },
  });
  if (!category) throw new Error(`카테고리 '${CATEGORY}' 가 없습니다`);
  const categoryLabel = await categoryLabelKo(CATEGORY);

  /*
    ⚠️ **종류별로 나눠 돈다.** 스펙 항목이 종류마다 다르므로 한 번에 섞어
    물으면 텐트에 러그 폭을 묻게 된다. 종류가 없는 카테고리는 한 덩어리다
  */
  const subtypes = await prisma.categorySubtype.findMany({
    where: {
      categoryId: category.id,
      active: true,
      ...(SUBTYPE ? { key: SUBTYPE } : {}),
    },
    orderBy: { displayOrder: "asc" },
    select: { id: true, key: true, labelKo: true },
  });
  const scopes: { key: string | null; label: string; id: string | null }[] =
    subtypes.length > 0
      ? subtypes.map((s) => ({ key: s.key, label: s.labelKo, id: s.id }))
      : [{ key: null, label: categoryLabel, id: null }];

  let asked = 0;
  let filled = 0;
  let touched = 0;
  const skipped: string[] = [];

  for (const scope of scopes) {
    if (asked >= LIMIT) break;

    const fields = await specFieldsFor({
      categoryKey: CATEGORY,
      subtypeKey: scope.key,
      // 어드민·배치 경로다 — ko 단일 (D-030)
      locale: "ko",
    });
    if (fields.length === 0) {
      console.log(`\n· ${scope.label} — 스펙 항목이 없습니다 (건너뜀)`);
      continue;
    }

    const rows = await prisma.codexItem.findMany({
      where: {
        mergedIntoId: null,
        categoryId: category.id,
        subtypeId: scope.id,
        // 기본은 **아직 하나도 없는 도감**만 (위 주석 참조)
        ...(REFILL ? {} : { specValues: { none: {} } }),
      },
      orderBy: { displayOrder: "desc" },
      take: Math.max(0, LIMIT - asked),
      select: { id: true, displayName: true },
    });
    if (rows.length === 0) {
      console.log(`\n· ${scope.label} — 채울 도감이 없습니다`);
      continue;
    }

    console.log(`\n■ ${scope.label} — 대상 ${rows.length}건 · 스펙 ${fields.length}종`);
    const byName = new Map(rows.map((r) => [r.displayName, r.id]));

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      asked += batch.length;
      let out: { name: string; specs: Record<string, unknown> }[] = [];
      try {
        out = await researchCodexSpecs({
          categoryLabel,
          scopeLabel: scope.label,
          specParts: specParts(fields),
          products: batch.map((r) => r.displayName),
        });
      } catch (e) {
        // 한 배치의 실패가 전체를 멈추지 않는다 — 수백 건을 도는 작업이다
        console.log(`   ✗ 배치 실패 — ${(e as Error).message}`);
        continue;
      }

      let batchFilled = 0;
      for (const r of out) {
        const codexId = byName.get(r.name);
        if (!codexId) continue;
        const keys = Object.keys(r.specs);
        if (keys.length === 0) continue;
        if (!APPLY) {
          batchFilled += keys.length;
          continue;
        }
        const res = await writeCodexSpecs({
          codexItemId: codexId,
          fields,
          values: r.specs,
          // 조사분이다 — 운영이 넣은 값을 덮지 않는다 (D-312)
          source: "RESEARCH",
        });
        batchFilled += res.written;
        if (res.written > 0) touched++;
        skipped.push(...res.skipped.map((s) => `${r.name} — ${s}`));
      }
      filled += batchFilled;
      console.log(
        `   [${Math.min(i + BATCH, rows.length)}/${rows.length}] 응답 ${out.length} · 스펙 ${batchFilled}개`,
      );
    }
  }

  console.log(`\n=== ${categoryLabel} ${APPLY ? "완료" : "미리보기"} ===`);
  console.log(`물어본 도감 ${asked}건 · 스펙 ${filled}개${APPLY ? ` · 도감 ${touched}건 갱신` : ""}`);
  if (skipped.length > 0) {
    // ⚠️ 조용히 버리지 않는다 — 허용 키 밖 값·형식 오류가 여기 드러난다 (D-188)
    console.log(`\n버린 값 ${skipped.length}개`);
    for (const s of skipped.slice(0, 15)) console.log(`   - ${s}`);
    if (skipped.length > 15) console.log(`   … 외 ${skipped.length - 15}건`);
  }
  if (asked >= LIMIT) {
    console.log(`\n⚠️ 상한 ${LIMIT}건에 걸렸습니다 — 같은 명령을 다시 돌리면 이어서 채웁니다`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
