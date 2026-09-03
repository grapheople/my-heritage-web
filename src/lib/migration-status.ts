import { EXPECTED_MIGRATIONS } from "@/generated/migrations";
import { prisma } from "@/lib/prisma";

/**
 * 이 빌드가 기대하는 마이그레이션이 DB 에 다 적용됐는가.
 *
 * ## ⚠️ "쿼리가 성공했다"는 증거가 아니다
 * `/api/health` 는 오래 `"① 마이그레이션": true` 를 하드코딩하고 있었다 —
 * 근거는 "쿼리가 성공했다는 것이 곧 증거다" 였다. **아니다.** 헬스체크가 보는
 * 테이블(Category·Brand·LevelDefinition)에 손대지 않는 마이그레이션이 밀리면
 * 헬스체크는 통과하는데 서비스는 죽는다.
 *
 * 2026-09-03 에 그렇게 됐다: `item_archive` 미적용 상태로 코드가 배포되어
 * `Item` 을 조회하는 화면이 전부 500 이었는데(`column "archivedAt" does not
 * exist`) `/api/health` 는 `ready` 판정에서 이 단계를 통과시켰다.
 */
export type MigrationState = {
  expected: number;
  applied: number;
  /** 코드는 기대하는데 DB 에 없는 것 — 비어 있어야 정상 */
  pending: string[];
  /** DB 에는 있는데 이 빌드는 모르는 것 — 롤백 배포에서 나타난다 */
  unknown: string[];
};

/**
 * 순수 비교 — DB 없이 테스트할 수 있게 분리해 둔다.
 *
 * ⚠️ **양방향으로 본다.** `pending` 만 보면 "코드를 되돌렸는데 DB 는 앞서 있는"
 * 상태를 놓친다. 그 경우도 스키마와 코드가 어긋난 것이라 알아야 한다.
 */
export function compareMigrations(
  expected: readonly string[],
  applied: readonly string[],
): MigrationState {
  const appliedSet = new Set(applied);
  const expectedSet = new Set(expected);
  return {
    expected: expected.length,
    applied: applied.length,
    pending: expected.filter((name) => !appliedSet.has(name)),
    unknown: applied.filter((name) => !expectedSet.has(name)),
  };
}

/**
 * DB 의 `_prisma_migrations` 를 읽어 비교한다.
 *
 * ⚠️ `finished_at IS NOT NULL AND rolled_back_at IS NULL` — 시작만 하고 실패한
 * 마이그레이션을 "적용됨"으로 세면 안 된다.
 */
export async function readMigrationState(): Promise<MigrationState> {
  const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name
    FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  `;
  return compareMigrations(
    EXPECTED_MIGRATIONS,
    rows.map((row) => row.migration_name),
  );
}
