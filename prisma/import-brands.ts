// .env.local 을 먼저 읽는다 — Next.js 와 순서를 맞춘다 (prisma/env.ts)
import "./env";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { BRANDED_CATEGORY_KEYS } from "../src/lib/categories";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  describeDatabase, migrationDatabaseUrl, pgSslConfig, stripSslMode,
} from "../src/lib/db-url";

/**
 * 브랜드 마스터 CSV 일괄 import (D-045).
 *
 * ## 왜 어드민 화면이 아니라 스크립트인가
 * 290건 × alias 약 900개를 A-11 화면에서 손으로 넣으면 수일이 걸리고 오타가
 * 난다. 시드는 **일회성 대량 작업**이고 이후 운영은 소량 증분이다 — 두 성격에
 * 각각 맞는 도구를 쓴다. A-11은 출시 후 증분·수정용이다.
 *
 * ## ⚠️ 멱등해야 한다 (D-045, FR-04-B-10)
 * 같은 CSV를 두 번 넣어도 브랜드가 중복 생성되지 않는다. `Brand.name` 이
 * `@unique` 이므로 그 값 기준 upsert 한다.
 *
 * ## CSV 스키마
 * `brandName,aliasKo,aliasJa,aliasEn,categories`
 * - 다중값 구분자는 세미콜론(`;`) — `aliasEn` 과 `categories` 에 쓰인다
 * - `aliases` 는 `{ ko: string[], ja: string[], en: string[] }` 로 저장된다
 *   (검색 인덱스 전용, 화면 미표시 — D-009)
 *
 * ## 사용법
 * ```
 * pnpm tsx prisma/import-brands.ts <csv경로> [--dry-run] [--prune]
 * ```
 * - `--dry-run` : DB 를 건드리지 않고 검증 결과만 출력한다. **먼저 이걸로 돌린다**
 * - `--prune`   : CSV 에 없는 기존 브랜드를 **비활성화**한다 (삭제하지 않는다).
 *                 아이템이 이미 참조 중일 수 있어 삭제는 위험하다 (D-036 과 같은 논리)
 */

/* ────────────────────────── CSV 파싱 ────────────────────────── */

/** 따옴표·개행을 포함할 수 있는 최소 CSV 파서. 의존성을 늘리지 않는다 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  // BOM 제거 — 스프레드시트에서 내보내면 붙는다
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/** 다중값 — 세미콜론 구분, 공백 제거, 빈 값 제외 */
function multi(v: string): string[] {
  return v.split(";").map((s) => s.trim()).filter(Boolean);
}

/**
 * 브랜드 동일성 판정용 정규화 (D-014).
 * NFKC + 공백·하이픈 제거 + 소문자. 검색 매칭과 같은 규칙을 쓴다.
 */
function normalize(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[\s-]/g, "");
}

/* ────────────────────────── 검증 ────────────────────────── */

const HEADER = ["brandName", "aliasKo", "aliasJa", "aliasEn", "categories"];
/** 브랜드 마스터가 있는 카테고리 (D-007 고정 목록에서 운동 제외 — D-166) */
const VALID_CATEGORIES = new Set<string>(BRANDED_CATEGORY_KEYS);

type Row = {
  line: number;
  name: string;
  aliases: { ko: string[]; ja: string[]; en: string[] };
  categories: string[];
};

function validate(rows: string[][]): { rows: Row[]; errors: string[] } {
  const errors: string[] = [];
  const [head, ...body] = rows;

  if (!head || head.map((h) => h.trim()).join(",") !== HEADER.join(",")) {
    errors.push(`헤더가 다릅니다. 기대: ${HEADER.join(",")} / 실제: ${head?.join(",")}`);
    return { rows: [], errors };
  }

  const parsed: Row[] = [];
  const seenName = new Map<string, number>();
  /** alias/원문이 어느 브랜드를 가리키는지 — 교차 충돌 검사용 */
  const seenToken = new Map<string, Set<string>>();

  body.forEach((cols, i) => {
    const line = i + 2; // 헤더가 1행
    const [name, ko, ja, en, cats] = cols.map((c) => c.trim());

    if (!name) { errors.push(`${line}행: brandName 이 비어 있습니다`); return; }

    // 원문 중복 — 정규화 후 비교한다. `Snow Peak` 과 `snowpeak` 은 같은 브랜드다
    const key = normalize(name);
    const prev = seenName.get(key);
    if (prev) {
      errors.push(`${line}행: '${name}' 이 ${prev}행과 정규화 후 중복입니다`);
      return;
    }
    seenName.set(key, line);

    const categories = multi(cats);
    if (categories.length === 0) {
      errors.push(`${line}행: '${name}' 의 categories 가 비어 있습니다`);
    }
    for (const c of categories) {
      if (!VALID_CATEGORIES.has(c)) {
        errors.push(`${line}행: '${name}' 의 카테고리 '${c}' 는 브랜드가 있는 카테고리 목록에 없습니다 (D-007·D-166)`);
      }
    }

    const aliases = { ko: multi(ko), ja: multi(ja), en: multi(en) };
    // alias 는 필수다 (D-047) — 없으면 그 언어 유저에게 브랜드가 없는 것과 같다
    for (const [lang, list] of Object.entries(aliases)) {
      if (list.length === 0) {
        errors.push(`${line}행: '${name}' 의 alias${lang.toUpperCase()} 가 비어 있습니다 (D-047 — alias 는 시드의 필수 구성요소)`);
      }
    }

    // ⚠️ 교차 충돌 — 서로 다른 브랜드가 같은 토큰을 가리키면 검색이 오매칭된다
    for (const token of [name, ...aliases.ko, ...aliases.ja, ...aliases.en]) {
      const n = normalize(token);
      if (!seenToken.has(n)) seenToken.set(n, new Set());
      seenToken.get(n)!.add(name);
    }

    parsed.push({ line, name, aliases, categories });
  });

  for (const [token, owners] of seenToken) {
    if (owners.size > 1) {
      errors.push(
        `alias 교차 충돌: '${token}' 을 ${[...owners].join(" / ")} 가 공유합니다 — 검색이 오매칭됩니다`,
      );
    }
  }

  return { rows: parsed, errors };
}

/* ────────────────────────── 실행 ────────────────────────── */

/**
 * ⚠️ **마이그레이션과 같은 DB 를 봐야 한다.**
 *
 * `DATABASE_URL` 을 그대로 쓰면 안 된다 — 로컬 개발에서 그 값은 docker 를
 * 가리키는데, 시드·import 는 **마이그레이션과 같은 대상**(원격)이어야 한다.
 * 실제로 이 차이 때문에 `prisma migrate deploy` 는 Supabase 에, 시드는
 * 로컬 docker 에 들어간 적이 있다 (`import` 가 "신규 0건 · 갱신 290건" 을
 * 냈다 — 깨끗한 DB 라면 신규 290 이어야 했다).
 */
const adapter = new PrismaPg({
  // ⚠️ `sslmode` 를 떼야 아래 `ssl` 이 반영된다 (D-115)
  connectionString: stripSslMode(migrationDatabaseUrl()),
  ssl: pgSslConfig(migrationDatabaseUrl()),
});
const prisma = new PrismaClient({ adapter });

async function main() {
  // ⚠️ 어느 DB 에 쓰는지 항상 보여준다 — 시드가 조용히 엉뚱한 DB 로 간 적이 있다
  console.log(`  대상 DB: ${describeDatabase(migrationDatabaseUrl())}`);
  const args = process.argv.slice(2);
  const csvPath = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  const prune = args.includes("--prune");

  if (!csvPath) {
    console.error("사용법: pnpm tsx prisma/import-brands.ts <csv경로> [--dry-run] [--prune]");
    process.exit(1);
  }

  const { rows, errors } = validate(parseCsv(readFileSync(csvPath, "utf-8")));

  console.log(`\n── 검증: ${csvPath}`);
  console.log(`   브랜드 ${rows.length}건`);
  const aliasCount = rows.reduce(
    (n, r) => n + r.aliases.ko.length + r.aliases.ja.length + r.aliases.en.length, 0,
  );
  console.log(`   alias ${aliasCount}개`);
  const byCat = new Map<string, number>();
  for (const r of rows) for (const c of r.categories) byCat.set(c, (byCat.get(c) ?? 0) + 1);
  console.log(`   카테고리 연결: ${[...byCat].map(([k, v]) => `${k} ${v}`).join(" · ")}`);

  if (errors.length > 0) {
    console.error(`\n❌ 오류 ${errors.length}건 — import 하지 않습니다\n`);
    for (const e of errors.slice(0, 30)) console.error(`   ${e}`);
    if (errors.length > 30) console.error(`   … 외 ${errors.length - 30}건`);
    process.exit(1);
  }
  console.log("   ✅ 오류 없음");

  if (dryRun) {
    console.log("\n--dry-run 이므로 DB 를 건드리지 않았습니다.\n");
    return;
  }

  // 카테고리는 seed.ts 가 먼저 넣어야 한다 (D-007 — 6개 고정)
  const cats = await prisma.category.findMany({ select: { id: true, key: true } });
  const catId = new Map(cats.map((c) => [c.key, c.id]));
  const missing = [...new Set(rows.flatMap((r) => r.categories))].filter((c) => !catId.has(c));
  if (missing.length > 0) {
    console.error(`\n❌ DB 에 없는 카테고리: ${missing.join(", ")}`);
    console.error("   먼저 `pnpm prisma db seed` 로 카테고리 6개를 넣으세요.\n");
    process.exit(1);
  }

  let created = 0;
  let updated = 0;

  for (const r of rows) {
    const wantCatIds = r.categories.map((c) => catId.get(c)!);
    const existing = await prisma.brand.findUnique({
      where: { name: r.name },
      select: { id: true },
    });

    const brand = await prisma.brand.upsert({
      where: { name: r.name },
      create: { name: r.name, aliases: r.aliases },
      // ⚠️ 멱등 — 같은 CSV 를 두 번 넣어도 중복 생성되지 않는다 (D-045).
      // active 는 건드리지 않는다 — 운영에서 끈 브랜드를 되살리면 안 된다
      update: { aliases: r.aliases },
      select: { id: true },
    });

    /*
      D-255 — 연결은 `BrandScope` 행이다. CSV 가 **카테고리 축의 SoT** 인 것은
      그대로다.

      ⚠️ **어드민이 종류로 좁힌 연결을 지우지 않는다.** CSV 에는 종류가 없으므로
      `set` 처럼 통째로 덮어쓰면 A-01 상세에서 만든 "시마노는 구동계·브레이크만"
      같은 설정이 임포트 때마다 사라진다.

      카테고리가 CSV 에서 **빠진 경우에만** 그 카테고리의 연결을 전부 지운다
      (공통·종류 모두) — 카테고리를 뗐으면 그 아래 좁힘도 의미가 없다.
    */
    await prisma.brandScope.deleteMany({
      where: { brandId: brand.id, categoryId: { notIn: wantCatIds } },
    });
    for (const categoryId of wantCatIds) {
      await prisma.brandScope.upsert({
        where: { brandId_scopeId: { brandId: brand.id, scopeId: categoryId } },
        update: {},
        create: { brandId: brand.id, categoryId },
      });
    }

    if (existing) updated++;
    else created++;
  }

  console.log(`\n── import 완료`);
  console.log(`   신규 ${created}건 · 갱신 ${updated}건`);

  if (prune) {
    // CSV 에 없는 브랜드는 **삭제하지 않고 비활성화**한다.
    // 아이템이 이미 참조 중일 수 있다 — 삭제하면 그 아이템의 브랜드가 사라진다
    // (D-036 "사용 중이면 비활성화만" 과 같은 논리)
    const names = rows.map((r) => r.name);
    const res = await prisma.brand.updateMany({
      where: { name: { notIn: names }, active: true },
      data: { active: false },
    });
    console.log(`   --prune: CSV 에 없는 브랜드 ${res.count}건을 비활성화했습니다 (삭제 아님)`);
  }
  console.log();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
