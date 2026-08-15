import "./env";
import { readFileSync } from "node:fs";
import { describeDatabase, runtimeDatabaseUrl } from "../src/lib/db-url";
import { syncPrimaryMatchKey } from "../src/lib/codex-match-key";
import { prisma } from "../src/lib/prisma";

/**
 * 도감 마스터 JSON 일괄 import — `export-codex.ts` 의 짝.
 *
 * ## 왜 필요한가
 * 시딩한 도감이 원격 DB 에만 있어 **로컬 docker 로 개발하면 도감이 4건**뿐이다.
 * 등록·매칭·검색 화면을 로컬에서 검증할 수 없다는 뜻이다. 브랜드가
 * `brands.csv` 로 해결한 문제를 도감에서도 같은 방식으로 푼다.
 *
 * ## ⚠️ 멱등해야 한다
 * 같은 파일을 두 번 넣어도 도감이 중복 생성되지 않는다.
 * `@@unique([categoryId, normalizedKey])` 를 기준으로 upsert 한다.
 *
 * ## ⚠️ `insertCodex` 를 쓰지 않는다 — 쓸 수 없다
 * `insertCodex` 는 **원시 입력값**(`keyValues`)에서 `buildMatchingKey` 로 키를
 * 만든다. 덤프에는 그 원시값이 없다 — 이미 정규화된 `normalizedKey` 뿐이라
 * 되돌릴 수 없다(정규화는 단방향이다). 그래서 여기서는 **이미 만들어진 키를
 * 그대로 옮긴다.** 새로 계산하지 않으므로 규칙이 갈릴 여지도 없다.
 *
 * 다만 **PRIMARY 행 생성만은 `syncPrimaryMatchKey` 를 부른다** — 도감을 만드는
 * 모든 경로가 그 함수를 거친다는 규칙(D-197)을 이 경로도 지킨다.
 *
 * ## ⚠️ `--prune` 이 없다 — 의도된 것이다
 * 브랜드와 달리 도감은 **유저 아이템이 직접 참조**한다(`Item.codexItemId`).
 * 파일에 없다는 이유로 지우거나 내리면 남의 방에서 아이템 정보가 사라진다.
 * 덤프는 **덧붙이는 것**이지 대상 DB 의 진실이 아니다.
 *
 * ## ⚠️ 검증 상태는 **올리기만** 한다
 * 오래된 덤프가 대상의 `VERIFIED` 를 `UNVERIFIED` 로 되돌리면 검증 배지가
 * 조용히 사라진다 — 배지는 신뢰 신호다 (D-033). 반대 방향만 허용한다.
 *
 * ```
 * pnpm db:import-codex prisma/codex.json --dry-run   # 먼저 이걸로 돌린다
 * pnpm db:import-codex prisma/codex.json
 *
 * # 로컬 docker 에 넣을 때는 앱과 같은 방식으로 URL 을 덮어쓴다
 * DATABASE_URL="postgresql://heritage:heritage@localhost:5434/my_heritage?schema=public" \
 *   pnpm db:import-codex prisma/codex.json
 * ```
 */

/** `export-codex.ts` 와 같아야 한다 */
const VERSION = 1;

/**
 * `verifiedBy`·`approvedBy` 에 넣는 표식.
 *
 * ⚠️ 원본의 `AdminUser.id` 를 그대로 옮기지 않는다 — 이 DB 에 없는 id 가
 * 실재하는 승인자처럼 읽힌다. 두 컬럼 모두 **null 여부만** 판정에 쓰이므로
 * (FR-06-C-05 · 검증 배지) 사실은 보존되고 출처는 정직해진다.
 */
const IMPORT_ACTOR = "import";

type KeyRow = {
  value: string;
  kind: "PRIMARY" | "ALIAS";
  source: "SYSTEM" | "MERGE" | "ADMIN" | "AI_APPROVED";
  approved: boolean;
};

type ItemRow = {
  category: string;
  displayName: string;
  uniqueId: string | null;
  normalizedKey: string;
  verification: "VERIFIED" | "UNVERIFIED";
  aliases: { ko: string[]; ja: string[]; en: string[] };
  description: string | null;
  descriptions: Record<string, string> | null;
  matchKeys: KeyRow[];
};

const KINDS = new Set(["PRIMARY", "ALIAS"]);
const SOURCES = new Set(["SYSTEM", "MERGE", "ADMIN", "AI_APPROVED"]);

/* ────────────────────────── 검증 ────────────────────────── */

/**
 * DB 를 건드리기 전에 파일 자체의 모순을 걷어낸다.
 *
 * ⚠️ **파일 안의 값 충돌을 여기서 잡는다.** `@@unique([categoryId, value])` 에
 * 걸리면 그 시점까지 넣은 것만 들어간 절반 상태가 된다 — 어디까지 들어갔는지
 * 모르는 상태가 가장 나쁘다.
 */
function validate(raw: unknown, validCategories: Set<string>): {
  items: ItemRow[];
  errors: string[];
} {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") return { items: [], errors: ["JSON 최상위가 객체가 아닙니다"] };

  const doc = raw as { version?: unknown; items?: unknown };
  if (doc.version !== VERSION) {
    errors.push(`형식 버전이 다릅니다. 기대 ${VERSION} / 실제 ${String(doc.version)}`);
    return { items: [], errors };
  }
  if (!Array.isArray(doc.items)) return { items: [], errors: ["`items` 가 배열이 아닙니다"] };

  const items: ItemRow[] = [];
  /** `카테고리key` → 그 값을 이미 쓴 도감 명칭 */
  const seenKey = new Map<string, string>();
  /** `카테고리normalizedKey` → 중복 도감 검출 */
  const seenItem = new Map<string, string>();

  (doc.items as unknown[]).forEach((r, i) => {
    const at = `items[${i}]`;
    const o = r as Partial<ItemRow>;

    if (typeof o.category !== "string" || !validCategories.has(o.category)) {
      errors.push(`${at}: 카테고리 '${String(o.category)}' 가 이 DB 에 없습니다`);
      return;
    }
    if (typeof o.displayName !== "string" || !o.displayName.trim()) {
      errors.push(`${at}: displayName 이 비어 있습니다`);
      return;
    }
    if (typeof o.normalizedKey !== "string" || !o.normalizedKey.trim()) {
      // 키가 없으면 어떤 아이템과도 만나지 않는다 (FR-04-A-04)
      errors.push(`${at}: '${o.displayName}' 의 normalizedKey 가 비어 있습니다`);
      return;
    }
    if (o.verification !== "VERIFIED" && o.verification !== "UNVERIFIED") {
      errors.push(`${at}: verification 값이 이상합니다 — ${String(o.verification)}`);
      return;
    }

    const itemKey = `${o.category}${o.normalizedKey}`;
    const dupItem = seenItem.get(itemKey);
    if (dupItem) {
      errors.push(`${at}: '${o.displayName}' 이 '${dupItem}' 과 같은 normalizedKey 입니다`);
      return;
    }
    seenItem.set(itemKey, o.displayName);

    const keys = Array.isArray(o.matchKeys) ? (o.matchKeys as KeyRow[]) : [];
    /*
      ⚠️ PRIMARY 가 `normalizedKey` 와 같아야 한다. 어긋나면 도감은 멀쩡히
      들어가고 **매칭만 조용히 안 된다** — D-185·D-186 과 같은 실패 모양이다
    */
    if (!keys.some((k) => k.kind === "PRIMARY" && k.value === o.normalizedKey)) {
      errors.push(
        `${at}: '${o.displayName}' 에 normalizedKey 와 일치하는 PRIMARY 매칭 키가 없습니다 (D-197)`,
      );
      return;
    }

    for (const k of keys) {
      if (typeof k?.value !== "string" || !k.value.trim()) {
        errors.push(`${at}: '${o.displayName}' 의 매칭 키 값이 비어 있습니다`);
        continue;
      }
      if (!KINDS.has(k.kind) || !SOURCES.has(k.source)) {
        errors.push(`${at}: '${o.displayName}' 의 매칭 키 '${k.value}' 의 kind/source 가 이상합니다`);
        continue;
      }
      const vk = `${o.category}${k.value}`;
      const owner = seenKey.get(vk);
      if (owner && owner !== o.displayName) {
        // 한 값이 두 도감을 가리키면 어느 쪽으로 매칭될지가 파일 순서에 달린다
        errors.push(
          `${at}: 매칭 키 '${k.value}' 를 '${owner}' 와 '${o.displayName}' 이 공유합니다 (FR-02-B-06)`,
        );
        continue;
      }
      seenKey.set(vk, o.displayName);
    }

    items.push({
      category: o.category,
      displayName: o.displayName.trim(),
      uniqueId: typeof o.uniqueId === "string" ? o.uniqueId : null,
      normalizedKey: o.normalizedKey,
      verification: o.verification,
      aliases: {
        ko: o.aliases?.ko ?? [],
        ja: o.aliases?.ja ?? [],
        en: o.aliases?.en ?? [],
      },
      description: typeof o.description === "string" ? o.description : null,
      descriptions:
        o.descriptions && typeof o.descriptions === "object" ? o.descriptions : null,
      matchKeys: keys.filter((k) => typeof k?.value === "string" && k.value.trim()),
    });
  });

  return { items, errors };
}

/* ────────────────────────── 실행 ────────────────────────── */

async function main() {
  // ⚠️ 쓰는 URL 을 그대로 표시한다 (D-202) — 시드가 조용히 엉뚱한 DB 로 간 적이 있다
  console.log(`대상 DB — ${describeDatabase(runtimeDatabaseUrl())}`);

  const args = process.argv.slice(2);
  const path = args.find((a) => !a.startsWith("--")) ?? "prisma/codex.json";
  const dryRun = args.includes("--dry-run");

  const categories = await prisma.category.findMany({ select: { id: true, key: true } });
  const categoryId = new Map(categories.map((c) => [c.key, c.id]));

  const { items, errors } = validate(
    JSON.parse(readFileSync(path, "utf-8")),
    new Set(categoryId.keys()),
  );

  if (errors.length > 0) {
    console.error(`\n검증 실패 ${errors.length}건 — 아무것도 쓰지 않았습니다`);
    for (const e of errors.slice(0, 30)) console.error(`  - ${e}`);
    if (errors.length > 30) console.error(`  … 외 ${errors.length - 30}건`);
    process.exit(1);
  }

  console.log(`파일 검증 통과 — 도감 ${items.length}건`);
  if (dryRun) {
    const keys = items.reduce((n, c) => n + c.matchKeys.length, 0);
    console.log(`[dry-run] 매칭 키 ${keys}건. DB 를 건드리지 않았습니다`);
    return;
  }

  let created = 0;
  let updated = 0;
  let primaryCreated = 0;
  let aliasCreated = 0;
  let upgraded = 0;
  /** ⚠️ 조용히 넘기지 않는다 — 왜 건너뛰었는지 모르면 D-188 을 반복한다 */
  const conflicts: string[] = [];

  for (const row of items) {
    const catId = categoryId.get(row.category)!;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.codexItem.findUnique({
        where: { categoryId_normalizedKey: { categoryId: catId, normalizedKey: row.normalizedKey } },
        select: { id: true, verification: true },
      });

      const verified = row.verification === "VERIFIED";
      const common = {
        displayName: row.displayName,
        uniqueId: row.uniqueId,
        aliases: row.aliases,
        description: row.description,
        descriptions: row.descriptions ?? undefined,
      };

      let codexId: string;
      if (existing) {
        // ⚠️ 검증은 **올리기만** 한다 (위 주석 참조)
        const upgrade = verified && existing.verification === "UNVERIFIED";
        await tx.codexItem.update({
          where: { id: existing.id },
          data: upgrade
            ? { ...common, verification: "VERIFIED", verifiedBy: IMPORT_ACTOR, verifiedAt: new Date() }
            : common,
        });
        codexId = existing.id;
        updated++;
        if (upgrade) upgraded++;
      } else {
        const made = await tx.codexItem.create({
          data: {
            categoryId: catId,
            normalizedKey: row.normalizedKey,
            verification: row.verification,
            // ⚠️ 미검증본에는 검증자·일시를 남기지 않는다 (`codex-insert.ts` 와 같은 규칙)
            verifiedBy: verified ? IMPORT_ACTOR : null,
            verifiedAt: verified ? new Date() : null,
            ...common,
          },
          select: { id: true },
        });
        codexId = made.id;
        created++;
      }

      /*
        ⚠️ PRIMARY 는 **도감 생성 경로가 공유하는 함수**로 만든다 (D-197).
        그 함수는 만들었는지 알려주지 않으므로 앞뒤로 세지 않고 미리 확인한다 —
        "신규 0" 으로 찍히면 정식 값이 안 들어간 것과 구분되지 않는다
      */
      const hadPrimary = await tx.codexMatchKey.findUnique({
        where: { categoryId_value: { categoryId: catId, value: row.normalizedKey } },
        select: { id: true },
      });
      await syncPrimaryMatchKey(tx, {
        codexItemId: codexId,
        categoryId: catId,
        normalizedKey: row.normalizedKey,
      });
      if (!hadPrimary) primaryCreated++;

      for (const k of row.matchKeys) {
        const has = await tx.codexMatchKey.findUnique({
          where: { categoryId_value: { categoryId: catId, value: k.value } },
          select: { codexItemId: true },
        });
        if (has) {
          /*
            ⚠️ **소유를 옮기지 않는다.** 대상 DB 에서 다른 도감이 이미 그 값을
            쓰고 있으면 덤프가 이기게 두면 안 된다 — 유저 아이템이 붙어 있는
            도감이 조용히 매칭에서 떨어져 나간다. 보고하고 넘긴다 (D-190)
          */
          if (has.codexItemId !== codexId) {
            conflicts.push(`${row.category} / '${row.displayName}' 의 키 '${k.value}' 는 다른 도감이 선점`);
          }
          continue;
        }
        await tx.codexMatchKey.create({
          data: {
            categoryId: catId,
            codexItemId: codexId,
            value: k.value,
            kind: k.kind,
            source: k.source,
            // 승인 대기(AI 제안)는 대기 상태 그대로 옮긴다 (FR-06-C-05)
            approvedBy: k.approved ? IMPORT_ACTOR : null,
          },
        });
        aliasCreated++;
      }
    });
  }

  console.log(`도감    : 신규 ${created} · 갱신 ${updated}${upgraded > 0 ? ` (검증 승격 ${upgraded})` : ""}`);
  console.log(`매칭 키 : 정식 값 ${primaryCreated} · 키 alias ${aliasCreated} 신규`);
  if (conflicts.length > 0) {
    console.log(`\n⚠️ 키 충돌 ${conflicts.length}건 — 기존 소유를 유지했습니다`);
    for (const c of conflicts.slice(0, 20)) console.log(`   - ${c}`);
    if (conflicts.length > 20) console.log(`   … 외 ${conflicts.length - 20}건`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
