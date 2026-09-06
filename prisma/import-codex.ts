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
/**
 * 읽을 수 있는 형식 버전.
 *
 * ⚠️ **v1 도 계속 읽는다** (D-309). v1 은 `subtype` 이 없어 전부 카테고리
 * 스코프로 들어간다 — 옛 백업을 못 읽게 만들면 그 시점 데이터를 복구할 길이
 * 사라진다. 새 파일은 v2 로 나온다.
 */
const SUPPORTED_VERSIONS = new Set([1, 2]);

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
  /** D-309 — `null` 이면 카테고리 스코프. v1 파일에는 없다 */
  subtype: string | null;
  /** D-276 표시명. v1 파일에는 없다 */
  names: { ko: string | null; ja: string | null; en: string | null };
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
function validate(
  raw: unknown,
  validCategories: Set<string>,
  /** `카테고리key/종류key` 조합 — 이 DB 에 실재하는 것만 (D-309) */
  validSubtypes: Set<string>,
): {
  items: ItemRow[];
  errors: string[];
} {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") return { items: [], errors: ["JSON 최상위가 객체가 아닙니다"] };

  const doc = raw as { version?: unknown; items?: unknown };
  if (typeof doc.version !== "number" || !SUPPORTED_VERSIONS.has(doc.version)) {
    errors.push(
      `형식 버전이 다릅니다. 지원 ${[...SUPPORTED_VERSIONS].join("·")} / 실제 ${String(doc.version)}`,
    );
    return { items: [], errors };
  }
  if (!Array.isArray(doc.items)) return { items: [], errors: ["`items` 가 배열이 아닙니다"] };

  const items: ItemRow[] = [];
  /*
    ⚠️ **스코프 단위로 본다** (D-254·D-309). 유니크가 `(scopeId, normalizedKey)`
    이고 `scopeId` 는 종류가 있으면 종류다 — 카테고리 단위로 세면 자전거
    `프레임`과 `휠셋`이 같은 키를 쓰는 **정상 상태를 중복으로 잘못 막는다.**
  */
  const scopeOf = (cat: string, sub: string | null) => `${cat}/${sub ?? "-"}`;
  /** `스코프값` → 그 값을 이미 쓴 도감 명칭 */
  const seenKey = new Map<string, string>();
  /** `스코프normalizedKey` → 중복 도감 검출 */
  const seenItem = new Map<string, string>();

  (doc.items as unknown[]).forEach((r, i) => {
    const at = `items[${i}]`;
    const o = r as Partial<ItemRow>;

    if (typeof o.category !== "string" || !validCategories.has(o.category)) {
      errors.push(`${at}: 카테고리 '${String(o.category)}' 가 이 DB 에 없습니다`);
      return;
    }
    // D-309 — v1 파일에는 없다. 있으면 이 DB 에 실재하는 조합이어야 한다
    const subtype = typeof o.subtype === "string" && o.subtype ? o.subtype : null;
    if (subtype && !validSubtypes.has(`${o.category}/${subtype}`)) {
      errors.push(`${at}: 종류 '${o.category}/${subtype}' 가 이 DB 에 없습니다`);
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

    const itemKey = `${scopeOf(o.category, subtype)}${o.normalizedKey}`;
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
      const vk = `${scopeOf(o.category, subtype)}${k.value}`;
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
      subtype,
      names: {
        ko: typeof o.names?.ko === "string" && o.names.ko ? o.names.ko : null,
        ja: typeof o.names?.ja === "string" && o.names.ja ? o.names.ja : null,
        en: typeof o.names?.en === "string" && o.names.en ? o.names.en : null,
      },
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

  // D-309 — `카테고리key/종류key` → 종류 id
  const subtypes = await prisma.categorySubtype.findMany({
    select: { id: true, key: true, category: { select: { key: true } } },
  });
  const subtypeId = new Map(subtypes.map((s) => [`${s.category.key}/${s.key}`, s.id]));

  const { items, errors } = validate(
    JSON.parse(readFileSync(path, "utf-8")),
    new Set(categoryId.keys()),
    new Set(subtypeId.keys()),
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
    const subId = row.subtype ? subtypeId.get(`${row.category}/${row.subtype}`)! : null;
    /*
      ⚠️ **유니크·조회는 전부 스코프 기준이다** (D-254). 종류가 있으면 종류가
      스코프고, 없으면 카테고리다. 여기서 카테고리로 고정하면 종류가 필수인
      카테고리의 도감이 **유저 아이템과 영원히 만나지 않는다** (D-309).
    */
    const scopeId = subId ?? catId;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.codexItem.findUnique({
        where: { scopeId_normalizedKey: { scopeId, normalizedKey: row.normalizedKey } },
        select: { id: true, verification: true },
      });

      const verified = row.verification === "VERIFIED";
      const common = {
        // 파일이 SoT 다 — 종류가 바뀌었으면 따라간다 (D-309)
        subtypeId: subId,
        /*
          ⚠️ **빈 값으로 덮지 않는다** — `import-brands` 와 같은 규칙이다.
          파일에 표시명이 없다고 해서 대상 DB 에서 누가 채워둔 것을 지우면
          안 된다. 값이 있을 때만 쓴다.
        */
        ...(row.names.ko ? { nameKo: row.names.ko } : {}),
        ...(row.names.ja ? { nameJa: row.names.ja } : {}),
        ...(row.names.en ? { nameEn: row.names.en } : {}),
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
        where: { scopeId_value: { scopeId, value: row.normalizedKey } },
        select: { id: true },
      });
      await syncPrimaryMatchKey(tx, {
        codexItemId: codexId,
        categoryId: catId,
        // ⚠️ 도감의 종류와 **반드시 같아야 한다** — 다르면 도감과 키의 스코프가 갈린다
        subtypeId: subId,
        normalizedKey: row.normalizedKey,
      });
      if (!hadPrimary) primaryCreated++;

      for (const k of row.matchKeys) {
        const has = await tx.codexMatchKey.findUnique({
          where: { scopeId_value: { scopeId, value: k.value } },
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
            subtypeId: subId,
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
