import "./env";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  describeDatabase,
  migrationDatabaseUrl,
  pgSslConfig,
  stripSslMode,
} from "../src/lib/db-url";

/**
 * 브랜드 마스터를 **CSV 로 내보낸다** (D-183).
 *
 * ## ⚠️ 왜 필요한가 — 마스터가 DB 에만 있었다
 * 브랜드 290건 + alias 902건이 **어느 시점에 DB 로 들어갔는데 소스 CSV 가
 * 저장소에 없다.** `import-brands.ts` 는 있지만 **입력이 없어** 새 환경을
 * 세우거나 DB 를 잃으면 **902건을 다시 만들어야 한다.**
 *
 * 브랜드 마스터가 비면 **첫 아이템 등록부터 막힌다** (D-044·D-045). alias 가
 * 비면 유저에게 "브랜드가 없는 것"으로 보인다 (D-047). 즉 **복구 불가한 단일
 * 지점**이었다.
 *
 * ## ⚠️ 내보낸 CSV 는 커밋한다
 * 비밀이 아니라 **마스터 데이터**다. 커밋해 두면 `db:import-brands` 로 어느
 * 환경에서든 같은 상태를 만들 수 있다 — 그것이 이 스크립트의 목적이다.
 *
 * ## 형식은 `import-brands.ts` 와 **정확히** 같아야 한다
 * 헤더·구분자(`;`)·컬럼 순서가 어긋나면 임포터가 헤더 검사에서 거부한다.
 * 그래서 헤더를 여기서 다시 쓰지 않고 **같은 상수를 눈으로 맞춘다** —
 * 임포터가 `prisma/` 스크립트라 import 하면 그쪽 `main()` 이 실행된다.
 *
 * ```
 * pnpm db:export-brands            # prisma/brands.csv 로 저장
 * ```
 */
/*
  D-276 — 표시명 3열이 뒤에 붙었다. **뒤에 붙이는 것이 의도다**: 옛 5열 CSV 를
  그대로 import 할 수 있어야 한다 (import 쪽이 부족한 열을 빈 값으로 읽는다)
*/
const HEADER = [
  "brandName", "aliasKo", "aliasJa", "aliasEn", "categories",
  "nameKo", "nameJa", "nameEn",
];
const OUT = join(process.cwd(), "prisma", "brands.csv");

/**
 * CSV 한 칸을 만든다.
 *
 * ⚠️ 브랜드 이름에 쉼표가 들어갈 수 있다(`Tag Heuer, Inc.` 같은 형태). 그러면
 * 컬럼이 밀린다 — 쉼표·따옴표·개행이 있으면 **따옴표로 감싸고 내부 따옴표를
 * 두 배로** 한다 (RFC 4180).
 */
function cell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

function aliasList(aliases: unknown, lang: "ko" | "ja" | "en"): string[] {
  if (!aliases || typeof aliases !== "object") return [];
  const a = aliases as Record<string, unknown>;
  return Array.isArray(a[lang])
    ? (a[lang] as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
}

async function main() {
  const url = migrationDatabaseUrl();
  // ⚠️ 비밀번호를 출력하지 않는다 (D-116)
  console.log(`대상 DB — ${describeDatabase(url)}`);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: stripSslMode(url),
      ssl: pgSslConfig(url),
    }),
  });

  const brands = await prisma.brand.findMany({
    // 이름순 — diff 가 안정적이어야 커밋 이력이 읽힌다
    orderBy: { name: "asc" },
    select: {
      nameKo: true,
      nameJa: true,
      nameEn: true,
      name: true,
      aliases: true,
      active: true,
      // D-255 — 연결은 BrandScope 다. CSV 는 **카테고리 축**이므로 중복 제거해 낸다
      scopes: {
        select: { category: { select: { key: true, displayOrder: true } } },
      },
    },
  });

  const lines = [HEADER.join(",")];
  let aliasCount = 0;
  let noCategory = 0;
  let inactive = 0;

  for (const b of brands) {
    // 같은 카테고리에 공통 + 종류 행이 둘 다 있을 수 있다
    const cats = [
      ...new Map(b.scopes.map((r) => [r.category.key, r.category])).values(),
    ].sort((a, c) => a.displayOrder - c.displayOrder);
    const ko = aliasList(b.aliases, "ko");
    const ja = aliasList(b.aliases, "ja");
    const en = aliasList(b.aliases, "en");
    aliasCount += ko.length + ja.length + en.length;
    if (cats.length === 0) noCategory++;
    // ⚠️ **비활성 브랜드도 내보낸다.** 임포터는 upsert 라 활성 상태를 되돌리지
    // 않는다 — 빼면 `--prune` 실행 시 영구히 사라지는 것과 같아진다 (D-036)
    if (!b.active) inactive++;
    lines.push(
      [
        cell(b.name),
        cell(ko.join(";")),
        cell(ja.join(";")),
        cell(en.join(";")),
        cell(cats.map((c) => c.key).join(";")),
        // ⚠️ 표시명은 **다중값이 아니다** — 세미콜론으로 나누지 않는다 (D-276)
        cell(b.nameKo ?? ""),
        cell(b.nameJa ?? ""),
        cell(b.nameEn ?? ""),
      ].join(","),
    );
  }

  writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  console.log(`브랜드 ${brands.length}건 · alias ${aliasCount}건 → ${OUT}`);
  if (noCategory > 0) {
    // 카테고리가 없으면 유저 화면의 브랜드 선택에 나오지 않는다 (D-044)
    console.log(`⚠️ 카테고리 미연결 ${noCategory}건 — 유저에게 보이지 않는다`);
  }
  if (inactive > 0) console.log(`비활성 ${inactive}건도 포함했다 (위 주석 참조)`);
  console.log(`복원: pnpm db:import-brands prisma/brands.csv`);
}

main();
