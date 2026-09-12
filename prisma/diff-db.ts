import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { describeDatabase, pgSslConfig, stripSslMode } from "../src/lib/db-url";

/**
 * 로컬 DB 와 운영 DB 의 **마스터 데이터 차이를 잰다** (D-318).
 *
 * ## ⚠️ 왜 "자동 양방향 동기화" 를 만들지 않는가
 * 두 DB 는 **대칭이 아니다.** 운영에는 유저가 만든 것이 계속 쌓이고(도감은 유저
 * 등록으로 자동 생성된다 — D-005), 로컬에는 시험용 쓰레기가 쌓인다. 양방향으로
 * 자동 복사하면 **로컬의 시험 아이템이 남의 방에 나타난다.** 되돌릴 수도 없다.
 *
 * 그래서 층을 갈라 **방향을 하나씩 고정**한다. 이 스크립트는 그 판단의 재료를
 * 만드는 **읽기 전용** 도구다 — 아무것도 쓰지 않는다.
 *
 * | 층 | SoT | 동기화 방향 | 수단 |
 * |---|---|---|---|
 * | 스키마 | `prisma/migrations` | 코드 → 양쪽 | `db:deploy` |
 * | 카테고리·속성정의·옵션·레벨 | `prisma/seed.ts` | 코드 → 양쪽 | `prisma db seed` |
 * | 브랜드 | `prisma/brands.csv` | 파일 → 양쪽 | `db:import-brands` |
 * | 도감 | `prisma/codex.json` | 파일 → 양쪽 | `db:import-codex` |
 * | **종류·카테고리속성·매칭키정의** | **없음** ⚠️ | — | `setup-*.ts` 에 흩어짐 |
 * | 유저 데이터 | 운영 | 운영 → 로컬 (원할 때만) | 없음 |
 *
 * ⚠️ **표의 5행이 이 도구가 필요한 이유다.** 종류·카테고리속성·매칭키정의는
 * 어드민 A-02 에서도 편집되고(`src/lib/actions/admin.ts`) 파일 SoT 가 없어,
 * **운영에서 바뀌면 로컬로 돌아올 길이 없다.** 수가 어긋났다는 사실이라도
 * 먼저 보여야 한다 (OI-118).
 *
 * ## ⚠️ 개수만 비교하지 않는다
 * 한쪽에서 1건 지우고 1건 더하면 개수는 같다. 그래서 **자연키**(사람이 읽는 키)
 * 로 집합을 비교한다 — cuid 는 DB 마다 다르므로 쓸 수 없다.
 *
 * ```
 * pnpm db:diff                 # 로컬 ↔ 운영
 * pnpm db:diff --strict        # 마스터가 어긋나면 종료코드 1 (CI 용)
 * pnpm db:diff --limit=30      # 예시를 더 본다
 * ```
 */

const LOCAL_FALLBACK =
  "postgresql://heritage:heritage@localhost:5434/my_heritage?schema=public";

/** 매칭 키 구분자 US(U+001F) — 눈에 보이지 않아 그대로 찍으면 키가 붙어 보인다 (D-199) */
const US = String.fromCharCode(31);

const argv = process.argv.slice(2);
const flag = (name: string) =>
  argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const STRICT = argv.includes("--strict");
const LIMIT = Number(flag("limit") ?? 8);

const A_URL = flag("local") ?? process.env.LOCAL_DATABASE_URL ?? LOCAL_FALLBACK;
/**
 * ⚠️ 풀러(6543)가 아니라 **직접 연결(5432)** 을 쓴다. 읽기뿐이라 풀러로도 되지만,
 * 전수 조회가 길어지면 transaction 풀러가 중간에 끊는다.
 */
const B_URL =
  flag("remote") ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DIRECT_URL;

function client(url: string) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: stripSslMode(url),
      ssl: pgSslConfig(url),
    }),
  });
}

/** 한 DB 에서 뽑은 자연키 집합들 */
type Snapshot = {
  counts: Record<string, number>;
  keys: Record<string, Map<string, string>>;
};

/**
 * 자연키로 스냅샷을 뜬다.
 *
 * ⚠️ **cuid 를 키로 쓰지 않는다.** 같은 값이어도 DB 마다 id 가 달라 전부
 * "다름" 으로 나온다. 카테고리 키·속성 키처럼 **사람이 정한 값**으로 잇는다.
 */
async function snapshot(url: string): Promise<Snapshot> {
  const p = client(url);
  try {
    const [cats, subs, defs] = await Promise.all([
      p.category.findMany({ select: { id: true, key: true } }),
      p.categorySubtype.findMany({
        select: { id: true, key: true, categoryId: true },
      }),
      p.attributeDefinition.findMany({ select: { id: true, key: true } }),
    ]);
    const catKey = new Map(cats.map((c) => [c.id, c.key]));
    const subKey = new Map(
      subs.map((s) => [s.id, `${catKey.get(s.categoryId) ?? "?"}/${s.key}`]),
    );
    const defKey = new Map(defs.map((d) => [d.id, d.key]));
    /**
     * 스코프 표기 — 종류가 있으면 종류, 없으면 카테고리 (D-254 와 같은 축).
     *
     * ⚠️ `categoryId` 도 nullable 이다 — `CategoryAttribute`·`MatchingKeyDefinition`
     * 은 **카테고리 아니면 종류 중 하나에만** 달린다 (`@@unique` 가 둘로 갈려 있다)
     */
    const scope = (categoryId: string | null, subtypeId: string | null) =>
      subtypeId
        ? (subKey.get(subtypeId) ?? "?")
        : (catKey.get(categoryId ?? "") ?? "?");

    const [
      opts,
      catAttrs,
      mkeys,
      brands,
      bscopes,
      codex,
      ckeys,
      exercises,
      levels,
      specValues,
    ] = await Promise.all([
      p.attributeOption.findMany({
        select: { key: true, attributeDefinitionId: true },
      }),
      p.categoryAttribute.findMany({
        select: {
          categoryId: true,
          subtypeId: true,
          attributeDefinitionId: true,
        },
      }),
      p.matchingKeyDefinition.findMany({
        select: { categoryId: true, subtypeId: true },
      }),
      p.brand.findMany({ select: { id: true, name: true } }),
      p.brandScope.findMany({
        select: { brandId: true, categoryId: true, subtypeId: true },
      }),
      p.codexItem.findMany({
        select: {
          categoryId: true,
          subtypeId: true,
          normalizedKey: true,
          displayName: true,
          verification: true,
          createdByUserId: true,
        },
      }),
      p.codexMatchKey.findMany({
        select: {
          categoryId: true,
          subtypeId: true,
          value: true,
          kind: true,
        },
      }),
      p.exercise.count(),
      p.levelDefinition.findMany({ select: { level: true } }),
      p.codexAttributeValue.count(),
    ]);
    const brandName = new Map(brands.map((b) => [b.id, b.name]));

    /** 자연키 → 사람이 읽는 설명 */
    const keys: Record<string, Map<string, string>> = {
      category: new Map(cats.map((c) => [c.key, c.key])),
      categorySubtype: new Map(
        subs.map((s) => [subKey.get(s.id)!, subKey.get(s.id)!]),
      ),
      attributeDefinition: new Map(defs.map((d) => [d.key, d.key])),
      attributeOption: new Map(
        opts.map((o) => {
          const k = `${defKey.get(o.attributeDefinitionId) ?? "?"}:${o.key}`;
          return [k, k];
        }),
      ),
      categoryAttribute: new Map(
        catAttrs.map((a) => {
          const k = `${scope(a.categoryId, a.subtypeId)} · ${defKey.get(a.attributeDefinitionId) ?? "?"}`;
          return [k, k];
        }),
      ),
      matchingKeyDefinition: new Map(
        mkeys.map((k) => {
          const s = scope(k.categoryId, k.subtypeId);
          return [s, s];
        }),
      ),
      brand: new Map(brands.map((b) => [b.name, b.name])),
      brandScope: new Map(
        bscopes.map((s) => {
          const k = `${brandName.get(s.brandId) ?? "?"} · ${scope(s.categoryId, s.subtypeId)}`;
          return [k, k];
        }),
      ),
      codexItem: new Map(
        codex.map((c) => [
          `${scope(c.categoryId, c.subtypeId)}|${c.normalizedKey}`,
          `${c.displayName} · ${c.verification}${c.createdByUserId ? " · 유저생성" : ""}`,
        ]),
      ),
      codexMatchKey: new Map(
        ckeys.map((k) => {
          const v = k.value.split(US).join("␟");
          return [`${scope(k.categoryId, k.subtypeId)}|${v}`, `${k.kind} ${v}`];
        }),
      ),
      levelDefinition: new Map(levels.map((l) => [String(l.level), `Lv.${l.level}`])),
    };

    const counts: Record<string, number> = Object.fromEntries(
      Object.entries(keys).map(([k, v]) => [k, v.size]),
    );
    // 운동·스펙값은 자연키가 도감과 겹치므로 **개수만** 본다 — 어긋남 판정에는 안 쓴다
    counts.exercise = exercises;
    counts.codexAttributeValue = specValues;

    return { counts, keys };
  } finally {
    await p.$disconnect();
  }
}

/** 유저 데이터 — **차이가 정상이다.** 어긋남으로 세지 않고 참고로만 보여준다 */
async function userCounts(url: string) {
  const p = client(url);
  try {
    const [user, room, item, itemAttributeValue, diary] = await Promise.all([
      p.user.count(),
      p.room.count(),
      p.item.count(),
      p.itemAttributeValue.count(),
      p.diary.count(),
    ]);
    return { user, room, item, itemAttributeValue, diary };
  } finally {
    await p.$disconnect();
  }
}

const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));

async function main() {
  if (!B_URL) {
    console.error(
      "❌ 운영 DB URL 이 없다. POSTGRES_URL_NON_POOLING 을 설정하거나 --remote= 로 넘기세요.",
    );
    process.exit(1);
  }
  console.log();
  console.log(`  로컬  ${describeDatabase(A_URL)}`);
  console.log(`  운영  ${describeDatabase(B_URL)}`);

  const [a, b] = await Promise.all([snapshot(A_URL), snapshot(B_URL)]);

  console.log(`\n  ${pad("마스터", 24)}${pad("로컬", 9)}${pad("운영", 9)}차이`);
  console.log(`  ${"-".repeat(52)}`);
  let drift = 0;
  const details: string[] = [];

  for (const name of Object.keys(a.counts)) {
    const ca = a.counts[name] ?? 0;
    const cb = b.counts[name] ?? 0;
    const ka = a.keys[name];
    const kb = b.keys[name];

    let mark = ca === cb ? "=" : `${ca > cb ? "+" : ""}${ca - cb}`;
    if (ka && kb) {
      const onlyA = [...ka.keys()].filter((k) => !kb.has(k));
      const onlyB = [...kb.keys()].filter((k) => !ka.has(k));
      if (onlyA.length || onlyB.length) {
        drift += onlyA.length + onlyB.length;
        // ⚠️ 개수가 같아도 내용이 다를 수 있다 — 그때도 여기서 잡힌다
        mark = `⚠️ 로컬만 ${onlyA.length} · 운영만 ${onlyB.length}`;
        details.push(`\n  ■ ${name}`);
        for (const k of onlyA.slice(0, LIMIT))
          details.push(`      로컬만  ${ka.get(k)}`);
        if (onlyA.length > LIMIT)
          details.push(`      … 로컬만 ${onlyA.length - LIMIT}건 더`);
        for (const k of onlyB.slice(0, LIMIT))
          details.push(`      운영만  ${kb.get(k)}`);
        if (onlyB.length > LIMIT)
          details.push(`      … 운영만 ${onlyB.length - LIMIT}건 더`);
      }
    }
    console.log(`  ${pad(name, 24)}${pad(String(ca), 9)}${pad(String(cb), 9)}${mark}`);
  }

  if (details.length) {
    console.log("\n  어긋난 항목");
    console.log(details.join("\n"));
  }

  const [ua, ub] = await Promise.all([userCounts(A_URL), userCounts(B_URL)]);
  console.log(`\n  ${pad("유저 데이터 (참고)", 22)}${pad("로컬", 9)}${pad("운영", 9)}`);
  console.log(`  ${"-".repeat(52)}`);
  for (const k of Object.keys(ua) as (keyof typeof ua)[]) {
    console.log(`  ${pad(k, 24)}${pad(String(ua[k]), 9)}${pad(String(ub[k]), 9)}`);
  }
  console.log(
    "\n  ⚠️ 유저 데이터는 달라야 정상이다 — 운영에 쌓인 것을 로컬로 옮기지 않는다",
  );

  if (drift === 0) {
    console.log("\n  ✅ 마스터 데이터 일치\n");
    return;
  }
  console.log(`\n  ⚠️ 마스터 ${drift}건 어긋남`);
  console.log("     운영 → 로컬   pnpm db:pull-master");
  console.log("     로컬 → 운영   pnpm db:push-master");
  console.log(
    "     ⚠️ 종류·카테고리속성·매칭키정의는 덤프 경로가 없다 — 위 명령으로 안 맞는다 (OI-118)\n",
  );
  if (STRICT) process.exit(1);
}

main();
