import "./env";
import { prisma } from "../src/lib/prisma";
import { describeDatabase, runtimeDatabaseUrl } from "../src/lib/db-url";

/**
 * 옛 운동 **아이템·도감 정리** (D-230).
 *
 * ## 무엇을 지우는가
 * 개편 전 운동 카테고리의 아이템(= 옛 "종목")과 그 아이템이 만든 도감이다.
 * 개편 후 운동 카테고리의 아이템은 **루틴뿐**이므로(D-227) 이 데이터는 어느
 * 화면에서도 의미를 갖지 않는다.
 *
 * ## ⚠️ 실유저 데이터가 아님을 확인하고 만든 스크립트다
 * 2026-08-18 실측 — 운영 7건 = **봇 6건 + PM 테스트 1건**, 실유저 **0명**
 * (D-230). 그래서 이관 스크립트를 만들지 않았다.
 *
 * **그럼에도 이 스크립트는 실유저 소유를 만나면 멈춘다.** 실측 이후에 누군가
 * 등록했을 수 있고, 그때 조용히 지우면 유저 데이터가 사라진다.
 *
 * ## ⚠️ 삭제 순서가 있다
 * ```
 * ItemAttributeValue → Item → CodexItem
 * ```
 * 도감을 먼저 지우면 `Item.codexItemId` 가 `SetNull` 로 끊겨 **고아 아이템**이
 * 남는다 (D-230).
 *
 * ## ⚠️ 기본은 **드라이런**이다
 * 무엇을 지울지 먼저 출력한다. 실제 삭제는 `--apply` 를 붙여야 한다 — 어디에
 * 쓰는지 보이지 않는 쓰기가 D-116 의 본질이었다.
 *
 *   pnpm db:cleanup-workout           # 드라이런
 *   pnpm db:cleanup-workout --apply   # 실제 삭제
 */

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`대상 DB — ${describeDatabase(runtimeDatabaseUrl())}`);
  console.log(APPLY ? "모드: **실제 삭제**" : "모드: 드라이런 (--apply 로 실행)");

  const category = await prisma.category.findUnique({
    where: { key: "workout" },
    select: { id: true },
  });
  if (!category) throw new Error("운동 카테고리가 없습니다");

  /*
    ⚠️ **루틴은 지우지 않는다.** 개편 후 만들어진 루틴은 정상 데이터다. 옛 종목만
    고른다 — 판별 기준은 **`RoutineExercise` 를 하나도 갖지 않고 도감에 연결된 것**
    이다. 루틴은 도감을 갖지 않으므로(`FR-10-A-02`) 이 조건으로 갈린다.
  */
  const items = await prisma.item.findMany({
    where: {
      categoryId: category.id,
      codexItemId: { not: null },
      routineItems: { none: {} },
    },
    select: {
      id: true,
      model: true,
      codexItemId: true,
      room: {
        select: {
          name: true,
          user: {
            select: { id: true, email: true, botAccount: { select: { id: true } } },
          },
        },
      },
    },
  });

  if (items.length === 0) {
    console.log("지울 옛 운동 아이템이 없습니다.");
    return;
  }

  console.log(`\n옛 운동 아이템 ${items.length}건`);
  const real: typeof items = [];
  for (const i of items) {
    const u = i.room?.user;
    const kind = u?.botAccount ? "봇" : "유저";
    console.log(`  ${kind} | ${i.model} | 방:${i.room?.name} | ${u?.email ?? "(이메일 없음)"}`);
    if (!u?.botAccount) real.push(i);
  }

  /*
    ⚠️ **실유저(봇 아님) 소유를 만나면 멈춘다.** D-230 은 "실유저 0명"을 근거로
    삭제를 골랐다. 그 전제가 깨졌다면 **결정을 다시 해야 한다** — 스크립트가
    조용히 진행하면 그 판단을 건너뛰는 셈이다.

    PM 테스트 계정도 여기 걸린다. 확인한 뒤 `--force-real` 로 진행한다.
  */
  const FORCE = process.argv.includes("--force-real");
  if (real.length > 0 && !FORCE) {
    console.log(
      `\n⚠️ 봇이 아닌 소유자의 아이템 ${real.length}건이 있습니다.` +
        `\n   D-230 은 "실유저 0명"을 전제로 삭제를 결정했습니다 — 전제를 확인하세요.` +
        `\n   확인했다면 --force-real 을 붙여 실행합니다.`,
    );
    if (!APPLY) console.log("\n(드라이런이라 아무것도 지우지 않았습니다)");
    return;
  }

  const itemIds = items.map((i) => i.id);
  const codexIds = [...new Set(items.map((i) => i.codexItemId).filter((c): c is string => !!c))];

  const values = await prisma.itemAttributeValue.count({ where: { itemId: { in: itemIds } } });
  console.log(`\n삭제 예정 — 아이템 ${itemIds.length} · 속성값 ${values} · 도감 ${codexIds.length}`);

  if (!APPLY) {
    console.log("\n(드라이런이라 아무것도 지우지 않았습니다. --apply 로 실행하세요)");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.itemAttributeValue.deleteMany({ where: { itemId: { in: itemIds } } });
    await tx.item.deleteMany({ where: { id: { in: itemIds } } });
    /*
      ⚠️ **보유 0건인 도감만 지운다.** 개편 후 만든 운동 마스터의 도감이 여기
      섞이면 마스터가 사라진다 — `Exercise` 가 `Cascade` 로 함께 지워진다
    */
    for (const codexId of codexIds) {
      const stillUsed = await tx.item.count({ where: { codexItemId: codexId } });
      const isExercise = await tx.exercise.count({ where: { codexItemId: codexId } });
      if (stillUsed === 0 && isExercise === 0) {
        await tx.codexItem.delete({ where: { id: codexId } });
      } else {
        console.log(`  도감 ${codexId} 보존 — 보유 ${stillUsed} · 운동 마스터 ${isExercise}`);
      }
    }
  });

  console.log("\n삭제 완료.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
