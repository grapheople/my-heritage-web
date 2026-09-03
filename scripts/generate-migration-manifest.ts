/**
 * `prisma/migrations` 디렉토리 → `src/generated/migrations.ts` 매니페스트.
 *
 * ## ⚠️ 왜 빌드 타임에 굽는가
 * `/api/health` 가 "이 코드가 기대하는 마이그레이션이 DB 에 다 적용됐는가"를
 * 판정하려면 **기대 목록**을 알아야 한다. 런타임에 `prisma/migrations` 를 읽을
 * 수는 없다 — 서버리스 번들에 그 디렉토리가 들어가지 않는다.
 *
 * 그래서 빌드할 때 목록을 파일로 굽는다. **빌드된 코드가 스스로 무엇을
 * 기대하는지 아는 것**이 핵심이다. 상수를 손으로 적으면 마이그레이션을 추가할
 * 때마다 고쳐야 하고, 빠뜨리면 판정이 조용히 무력해진다.
 *
 * ## ⚠️ 이 파일이 잡는 사고
 * 2026-09-03 — `20260903090000_item_archive` 를 운영 DB 에 적용하지 않고 코드를
 * 배포해 `/ko`·`/ko/market` 이 전부 500 이었다 (`column "archivedAt" does not
 * exist`). 그런데 `/api/health` 는 `"① 마이그레이션": true` 를 하드코딩하고
 * 있어서 **배포 후 확인을 통과했다.** DEPLOY.md §7 이 이 엔드포인트를 확인
 * 수단으로 쓰는데 정작 D-097 이 경고하는 순서 사고를 못 잡았다.
 */
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");
const OUT_FILE = join(process.cwd(), "src", "generated", "migrations.ts");

const names = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (names.length === 0) {
  throw new Error(`마이그레이션이 없다: ${MIGRATIONS_DIR} — 경로를 확인하라`);
}

const body = `// 자동 생성 — 직접 수정하지 마라.
// scripts/generate-migration-manifest.ts 가 prisma/migrations 를 읽어 굽는다.
//
// 이 빌드가 기대하는 마이그레이션 목록. /api/health 가 DB 의
// _prisma_migrations 와 비교해 배포-마이그레이션 순서 사고를 잡는다.

export const EXPECTED_MIGRATIONS = [
${names.map((name) => `  "${name}",`).join("\n")}
] as const;
`;

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, body, "utf-8");

console.log(`✔ 마이그레이션 매니페스트 ${names.length}개 → src/generated/migrations.ts`);
