import "./env";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describeDatabase, runtimeDatabaseUrl } from "../src/lib/db-url";
import { prisma } from "../src/lib/prisma";

/**
 * 도감 마스터를 **JSON 으로 내보낸다** (D-183 과 같은 논리, 대상만 도감).
 *
 * ## ⚠️ 왜 필요한가 — 도감이 한 DB 에만 있다
 * 브랜드 290건은 `prisma/brands.csv` 로 저장소에 고정돼 있어 어느 환경에서든
 * `db:import-brands` 로 복원된다. **도감에는 그 층이 없다.** 그래서 시딩한
 * 273건(시계 182 · 신발 85 · 운동 6)이 원격 DB 에만 있고, 로컬 docker 로
 * 개발하면 도감이 **4건**뿐이라 등록·매칭 화면을 사실상 검증할 수 없다.
 *
 * 다시 만들 수도 없다 — `db:research-codex` 는 건당 수십 초가 걸리고 **결과가
 * 매번 다르다.** D-186~D-189 에서 사람이 내린 판정(식별 단위·중복 정리)을
 * 통째로 재검증해야 한다. 즉 **복구 불가한 단일 지점**이었다.
 *
 * ## ⚠️ `CodexMatchKey` 를 반드시 함께 담는다 (D-197)
 * 도감만 옮기고 매칭 인덱스를 빠뜨리면 **`CodexItem` 에는 있는데 매칭으로는
 * 영원히 닿지 않는다** — 등록할 때마다 미검증 도감이 새로 생기는, D-185·D-186
 * 과 같은 실패 모양이다. 브랜드 CSV 에는 없던 층이라 잊기 쉽다.
 *
 * ## 무엇을 빼는가 — **다른 DB 에서 가리킬 곳이 없는 것**
 * | 뺀 것 | 이유 |
 * |---|---|
 * | `createdByUserId` | 유저 참조. 대상 DB 에 그 유저가 없다 (M-02 — 생성자 없는 도감은 정상) |
 * | `verifiedBy`·`verifiedAt` | `AdminUser.id` 참조. **검증 사실만** 옮기고 검증자는 임포터가 다시 찍는다 |
 * | `mergedIntoId`·`mergedItemIds` | 아이템 참조. 흡수된 도감은 **아예 내보내지 않는다**(survivor 만) |
 * | `sourceMergeId` | `CodexMerge` 를 안 옮기므로 가리킬 곳이 없다. **병합 이력은 원본 DB 에만 남는다** |
 *
 * 흡수된 도감을 빼도 **매칭은 손실되지 않는다** — 그 도감의 정식 값은 병합
 * 시점에 survivor 의 `MERGE` 출처 키 alias 로 넘어가 있다 (FR-05-B-09).
 *
 * ## 왜 CSV 가 아니라 JSON 인가
 * 브랜드는 CSV 로 충분했지만 도감은 아니다. 복합 매칭 키의 구분자가
 * **US(U+001F)** 라 텍스트 포맷에서 눈에 보이지 않고(D-199), 스프레드시트를
 * 거치면 조용히 사라진다 — 그러면 키가 통째로 달라진다. `descriptions` 도
 * 언어별 중첩 객체다. JSON 은 그 문자를 눈에 보이는 이스케이프로 적는다.
 *
 * ## ⚠️ 내보낸 JSON 은 커밋한다
 * 비밀이 아니라 **마스터 데이터**다. `brands.csv` 와 같은 취급이다.
 *
 * ```
 * pnpm db:export-codex            # prisma/codex.json 으로 저장
 * ```
 */

const OUT = join(process.cwd(), "prisma", "codex.json");

/** 파일 형식 버전. 임포터가 이 값을 확인한다 */
const VERSION = 1;

function langList(v: unknown, lang: "ko" | "ja" | "en"): string[] {
  if (!v || typeof v !== "object") return [];
  const o = v as Record<string, unknown>;
  return Array.isArray(o[lang])
    ? (o[lang] as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
}

function descriptions(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== "object") return null;
  const out: Record<string, string> = {};
  for (const lang of ["ko", "ja", "en"] as const) {
    const s = (v as Record<string, unknown>)[lang];
    if (typeof s === "string" && s.trim()) out[lang] = s;
  }
  return Object.keys(out).length > 0 ? out : null;
}

async function main() {
  /*
    ⚠️ **읽는 URL 을 그대로 표시한다** (D-202). 표시용과 실제용으로 URL 을 두 번
    구하면 "Supabase 라고 찍고 localhost 에서 읽는" 상태가 만들어진다 — 실제로
    `botTargetDb()` 가 그랬다. 여기서는 `src/lib/prisma` 하나만 쓴다.
  */
  console.log(`읽는 DB — ${describeDatabase(runtimeDatabaseUrl())}`);

  const items = await prisma.codexItem.findMany({
    // ⚠️ 흡수된 도감은 제외한다 — survivor 만이 유효한 도감이다 (FR-02-B-08)
    where: { mergedIntoId: null },
    orderBy: [{ category: { key: "asc" } }, { normalizedKey: "asc" }],
    select: {
      displayName: true,
      uniqueId: true,
      normalizedKey: true,
      aliases: true,
      description: true,
      descriptions: true,
      verification: true,
      category: { select: { key: true } },
      matchKeys: {
        orderBy: [{ kind: "asc" }, { value: "asc" }],
        select: { value: true, kind: true, source: true, approvedBy: true },
      },
    },
  });

  const byCategory = new Map<string, number>();
  let aliasKeys = 0;
  let pending = 0;
  /** ⚠️ PRIMARY 가 없는 도감 — 매칭으로 닿지 않는다. 조용히 넘기지 않는다 */
  const unreachable: string[] = [];

  const out = items.map((c) => {
    byCategory.set(c.category.key, (byCategory.get(c.category.key) ?? 0) + 1);

    const hasPrimary = c.matchKeys.some(
      (k) => k.kind === "PRIMARY" && k.value === c.normalizedKey,
    );
    if (!hasPrimary) unreachable.push(`${c.category.key} / ${c.displayName}`);

    for (const k of c.matchKeys) {
      if (k.kind === "ALIAS") aliasKeys++;
      // `AI_APPROVED` + `approvedBy` 없음 = 승인 대기 (FR-06-C-05)
      if (k.source === "AI_APPROVED" && !k.approvedBy) pending++;
    }

    return {
      // ⚠️ 카테고리는 **`key`** 로 참조한다 — `id` 는 DB 마다 다르다
      category: c.category.key,
      displayName: c.displayName,
      uniqueId: c.uniqueId,
      normalizedKey: c.normalizedKey,
      verification: c.verification,
      aliases: {
        ko: langList(c.aliases, "ko"),
        ja: langList(c.aliases, "ja"),
        en: langList(c.aliases, "en"),
      },
      description: c.description,
      descriptions: descriptions(c.descriptions),
      matchKeys: c.matchKeys.map((k) => ({
        value: k.value,
        kind: k.kind,
        source: k.source,
        /*
          ⚠️ **`approvedBy` 문자열을 그대로 옮기지 않는다.** 다른 DB 의
          `AdminUser.id` 라 대상에서는 가리킬 곳이 없는데, 값이 남아 있으면
          실재하는 승인자처럼 읽힌다. **승인됐다는 사실만** 옮긴다
        */
        approved: k.approvedBy !== null,
      })),
    };
  });

  writeFileSync(
    OUT,
    // ⚠️ 들여쓰기 2 + 안정 정렬 — diff 가 읽혀야 커밋 이력이 쓸모 있다
    JSON.stringify({ version: VERSION, items: out }, null, 2) + "\n",
    "utf8",
  );

  const totalKeys = out.reduce((n, c) => n + c.matchKeys.length, 0);
  console.log(`도감 ${out.length}건 · 매칭 키 ${totalKeys}건(키 alias ${aliasKeys}) → ${OUT}`);
  console.log(
    `  카테고리별 — ${[...byCategory].map(([k, n]) => `${k} ${n}`).join(" · ")}`,
  );
  if (pending > 0) {
    // 승인 대기 상태 그대로 옮긴다. 임포터도 미승인으로 넣는다 (FR-06-C-05)
    console.log(`  AI 제안 승인 대기 ${pending}건도 포함했다 — 대상에서도 미승인이다`);
  }
  if (unreachable.length > 0) {
    console.log(
      `\n⚠️ PRIMARY 매칭 키가 없는 도감 ${unreachable.length}건 — 원본 DB 에서 매칭으로 닿지 않는다 (D-197)`,
    );
    for (const s of unreachable.slice(0, 10)) console.log(`   - ${s}`);
    if (unreachable.length > 10) console.log(`   … 외 ${unreachable.length - 10}건`);
    console.log(`   → \`pnpm db:backfill-match-keys\` 를 먼저 돌리세요`);
  }
  console.log(`\n복원: pnpm db:import-codex prisma/codex.json --dry-run`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
