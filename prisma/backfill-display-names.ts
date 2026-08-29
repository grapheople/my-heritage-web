import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeBrandToken } from "../src/lib/brand-search";

/**
 * 표시용 언어별 명칭을 **기존 데이터에서 채운다** (D-276).
 *
 * ## ⚠️ alias 를 무턱대고 옮기지 않는다 — 언어마다 품질이 다르다
 * | 대상 | 옮기는 값 | 왜 |
 * |---|---|---|
 * | 브랜드 `nameEn` | **`name`(원문)** | 309건 전부 라틴 표기다. en alias 는 `gshock` 같은 소문자 검색 토큰이라 쓰면 **이름이 깨진다** |
 * | 브랜드 `nameKo` | `aliases.ko[0]` | `오리엔트스타`·`지샥` — 표시 품질이다 (309/309 보유) |
 * | 브랜드 `nameJa` | `aliases.ja[0]` | `オリエントスター`·`Gショック` — 표시 품질이다 (309/309) |
 * | 도감 `nameEn`·`nameJa` | 각 `aliases[lang][0]` **단, 원문의 정규화 중복이 아닐 때만** | 운동 도감은 `Bench Press`·`ベンチプレス` 처럼 표시 품질이다. 다른 카테고리 alias 가 원문 소문자꼴이면 옮겨봐야 이름만 망가지므로 걸러낸다 |
 *
 * ⚠️ **도감 `nameKo` 는 채우지 않는다.** ko alias 가 **0건**이다. 다만 운동
 * 도감은 원문 자체가 한국어라(`바벨 벤치프레스`) 비워둬도 원문으로 떨어져
 * 결과가 같다 — 없는 데이터를 지어내지 않는다.
 *
 * ⚠️ **첫 alias 를 쓴다.** 운동은 `["ベンチプレス","バーベルベンチプレス"]` 처럼
 * **짧은 표준명이 앞**에 온다 — 목록에 띄우기 좋은 쪽이다.
 *
 * ⚠️ **이미 값이 있으면 덮지 않는다.** 어드민이 손으로 고친 것을 되돌리면 안 된다.
 *
 * ```
 * pnpm tsx prisma/backfill-display-names.ts          # 미리보기
 * pnpm tsx prisma/backfill-display-names.ts --apply
 * ```
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const APPLY = process.argv.includes("--apply");

type Aliases = { ko?: string[]; ja?: string[]; en?: string[] };

/** alias 가 원문의 **정규화 중복**이면 표시명으로 쓸 값이 아니다 */
function isEchoOfOriginal(alias: string, original: string): boolean {
  return normalizeBrandToken(alias) === normalizeBrandToken(original);
}

async function brands() {
  const rows = await prisma.brand.findMany({
    select: { id: true, name: true, aliases: true, nameKo: true, nameJa: true, nameEn: true },
  });
  let filled = 0;
  const missing: string[] = [];

  for (const b of rows) {
    const a = (b.aliases ?? {}) as Aliases;
    const ko = (a.ko ?? []).find(Boolean);
    const ja = (a.ja ?? []).find(Boolean);
    const data: Record<string, string> = {};
    // ⚠️ en 은 alias 가 아니라 **원문**이다 — alias 는 소문자 검색 토큰이다
    if (!b.nameEn) data.nameEn = b.name;
    if (!b.nameKo && ko) data.nameKo = ko;
    if (!b.nameJa && ja) data.nameJa = ja;
    if (!ko || !ja) missing.push(`${b.name} (ko=${ko ?? "없음"} · ja=${ja ?? "없음"})`);
    if (Object.keys(data).length === 0) continue;
    if (APPLY) await prisma.brand.update({ where: { id: b.id }, data });
    filled++;
  }
  console.log(`브랜드 ${rows.length}건 — ${APPLY ? "채움" : "채울 것"} ${filled}건`);
  if (missing.length) {
    console.log(`⚠️ ko/ja alias 가 없어 비워두는 브랜드 ${missing.length}건 (원문으로 떨어진다)`);
    for (const m of missing.slice(0, 10)) console.log(`   · ${m}`);
  }
}

async function codex() {
  const rows = await prisma.codexItem.findMany({
    select: { id: true, displayName: true, aliases: true, nameEn: true, nameJa: true },
  });
  const filled = { en: 0, ja: 0 };
  let echoSkipped = 0;
  let touched = 0;

  for (const c of rows) {
    const a = (c.aliases ?? {}) as Aliases;
    const data: Record<string, string> = {};

    for (const [lang, field, current] of [
      ["en", "nameEn", c.nameEn],
      ["ja", "nameJa", c.nameJa],
    ] as const) {
      if (current) continue;
      const v = (a[lang] ?? []).find(Boolean);
      if (!v) continue;
      /*
        ⚠️ 원문의 소문자꼴을 표시명으로 승격하면 **이름이 나빠진다.**
        브랜드 en alias 가 `gshock` 인 것과 같은 함정이다
      */
      if (isEchoOfOriginal(v, c.displayName)) {
        echoSkipped++;
        continue;
      }
      data[field] = v;
      filled[lang]++;
    }

    if (Object.keys(data).length === 0) continue;
    if (APPLY) await prisma.codexItem.update({ where: { id: c.id }, data });
    touched++;
  }
  console.log(`\n도감 ${rows.length}건 — ${APPLY ? "채운" : "채울"} 행 ${touched}건`);
  console.log(`   nameEn ${filled.en}건 · nameJa ${filled.ja}건`);
  console.log(`   원문의 정규화 중복이라 건너뜀: ${echoSkipped}건`);
  console.log(`   ⚠️ nameKo 는 채우지 않는다 — ko alias 가 0건이다`);
}

async function main() {
  console.log(`대상 DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}`);
  console.log(APPLY ? "모드: 적용\n" : "모드: 미리보기 (--apply 로 적용)\n");
  await brands();
  await codex();

  if (APPLY) {
    // ⚠️ 검산 — 표시명이 하나도 없어 원문으로만 떨어지는 행이 몇 건인가
    const brandNoName = await prisma.brand.count({
      where: { nameKo: null, nameJa: null, nameEn: null },
    });
    const codexAny = await prisma.codexItem.count({
      where: { OR: [{ nameKo: { not: null } }, { nameJa: { not: null } }, { nameEn: { not: null } }] },
    });
    console.log(
      `\n검산 — 표시명이 전무한 브랜드 ${brandNoName}건 (0이어야 함)` +
        ` · 표시명이 하나라도 있는 도감 ${codexAny}건`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
