/**
 * 기존 도감의 `normalizedKey` → `CodexMatchKey` PRIMARY 행 백필 (D-197).
 *
 * ⚠️ **이걸 돌리기 전에는 매칭이 전부 미스가 된다.** `resolveCodexByKey` 는
 * `CodexMatchKey` 만 보므로, 인덱스가 비어 있으면 기존 도감 273건이 통째로
 * 안 보이고 등록마다 미검증 도감이 새로 생긴다. **스키마 적용과 한 묶음이다.**
 *
 * ⚠️ **양쪽 DB 에 돌린다** — Supabase + 로컬 docker(5434). 한쪽만 하면 로컬에서
 * 도감이 사라진 것처럼 보인다 (D-187 에서 겪음).
 *
 * 멱등하다. `@@unique([categoryId, value])` 에 걸리는 행은 건너뛴다.
 *
 *   pnpm db:backfill-match-keys
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const codexItems = await prisma.codexItem.findMany({
    select: { id: true, categoryId: true, subtypeId: true, scopeId: true, normalizedKey: true, displayName: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`도감 ${codexItems.length}건 확인`);

  let created = 0;
  let skipped = 0;
  /** ⚠️ 조용히 넘기지 않는다 — 왜 건너뛰었는지 모르면 D-188 을 반복한다 */
  const conflicts: string[] = [];

  for (const c of codexItems) {
    if (!c.normalizedKey) {
      conflicts.push(`${c.displayName}: normalizedKey 가 비어 있다`);
      continue;
    }
    const existing = await prisma.codexMatchKey.findUnique({
      where: { scopeId_value: { scopeId: c.scopeId, value: c.normalizedKey } },
      select: { codexItemId: true, kind: true },
    });

    if (existing) {
      if (existing.codexItemId === c.id) {
        skipped++; // 이미 넣었다 — 멱등
      } else {
        // ⚠️ 다른 도감이 그 값을 선점했다. 고쳐서 넣지 않는다 — 어느 쪽이
        // 맞는지 스크립트가 판단할 수 없다 (D-190 의 "고르지 않고 실패시킨다")
        conflicts.push(
          `${c.displayName}(${c.normalizedKey}): 다른 도감이 선점 — ${existing.kind}`,
        );
      }
      continue;
    }

    await prisma.codexMatchKey.create({
      data: {
        categoryId: c.categoryId,
        codexItemId: c.id,
        value: c.normalizedKey,
        kind: "PRIMARY",
        source: "SYSTEM",
      },
    });
    created++;
  }

  console.log(`\n생성 ${created} / 기존 ${skipped}`);
  if (conflicts.length > 0) {
    console.log(`\n⚠️ 건너뛴 ${conflicts.length}건:`);
    for (const c of conflicts) console.log(`  - ${c}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
