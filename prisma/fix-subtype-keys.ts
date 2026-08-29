import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildMatchingKey } from "../src/lib/codex-key";
import { resolveMatchingKeyOrder } from "../src/lib/subtype";

/**
 * 종류 키로 만들어졌어야 할 도감의 `normalizedKey` 를 **다시 만든다** (D-270).
 *
 * ## ⚠️ 무엇이 잘못됐나 — 유저 등록과 도감 생성이 다른 키를 썼다
 * `insertCodex` 가 `category.matchingKey` 를 **직접 읽어** 카테고리 키를 썼고,
 * 유저 등록(`actions/item.ts`)은 `resolveMatchingKeyOrder` 로 **종류 키**를 썼다.
 *
 * 자전거 부품은 종류 키가 `{brand, model}` 인데 카테고리 키가
 * `{brand, model, year}` 다:
 * ```
 * 도감      sram|redetapaxs|     ← 빈 세 번째 칸
 * 유저 등록  sram|redetapaxs      ← 만나지 않는다
 * ```
 * **부품 도감 191건이 전부 유저 등록과 만나지 않는 상태**였다 — 보유자 0명
 * 도감이 쌓이는 D-185·D-186 과 같은 실패 모양이다.
 *
 * ## ⚠️ 명칭에서 값을 되만들지 않는다
 * 옛 키의 **세그먼트를 그대로 쓴다.** 명칭을 다시 파싱하면 D-186 이 겪은
 * "명칭 슬러그가 고유번호로 들어감" 을 반복한다.
 *
 * ## ⚠️ 매칭 키 행도 함께 고친다
 * `CodexMatchKey` 의 PRIMARY 값이 `normalizedKey` 와 같아야 매칭이 닿는다
 * (D-197). 도감만 고치면 반쪽이다.
 *
 * ⚠️ 새 키가 **다른 도감과 충돌하면 건너뛴다** — 고르지 않고 알린다 (D-190).
 *
 * ```
 * pnpm tsx prisma/fix-subtype-keys.ts          # 미리보기
 * pnpm tsx prisma/fix-subtype-keys.ts --apply
 * ```
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes("--apply");
const SEP = "";

async function main() {
  console.log(`대상 DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}`);
  console.log(APPLY ? "모드: 적용\n" : "모드: 미리보기 (--apply 로 적용)\n");

  // 종류가 지정된 도감만 대상 — 카테고리 스코프는 애초에 카테고리 키가 맞다
  const rows = await prisma.codexItem.findMany({
    where: { subtypeId: { not: null } },
    select: {
      id: true,
      displayName: true,
      normalizedKey: true,
      categoryId: true,
      subtypeId: true,
      scopeId: true,
    },
  });
  console.log(`종류 지정 도감 ${rows.length}건 확인`);

  let fixed = 0;
  let same = 0;
  const clashes: string[] = [];
  const skipped: string[] = [];

  for (const r of rows) {
    const keyOrder = await resolveMatchingKeyOrder({
      categoryId: r.categoryId,
      subtypeId: r.subtypeId,
    });
    const oldParts = r.normalizedKey.split(SEP);

    /*
      ⚠️ 옛 키가 새 키보다 **짧으면** 값을 만들어내야 하므로 건너뛴다.
      길면 앞에서부터 잘라 쓴다 — 카테고리 키가 종류 키의 상위 집합이라
      순서가 같다는 전제이고, 실제로 `{brand,model,year}` ⊃ `{brand,model}` 이다.
    */
    if (oldParts.length < keyOrder.length) {
      skipped.push(`${r.displayName} — 옛 키가 짧다 (${oldParts.length} < ${keyOrder.length})`);
      continue;
    }

    const values: Record<string, string> = {};
    keyOrder.forEach((k, i) => (values[k] = oldParts[i] ?? ""));
    const built = buildMatchingKey(keyOrder, values);
    if (!built) {
      skipped.push(`${r.displayName} — 키를 만들 수 없다`);
      continue;
    }
    if (built.normalizedKey === r.normalizedKey) {
      same++;
      continue;
    }

    // 새 키가 같은 스코프의 다른 도감과 부딪히나
    const clash = await prisma.codexItem.findFirst({
      where: { scopeId: r.scopeId, normalizedKey: built.normalizedKey, id: { not: r.id } },
      select: { displayName: true },
    });
    if (clash) {
      clashes.push(`${r.displayName} → ${built.normalizedKey} (충돌: ${clash.displayName})`);
      continue;
    }
    const takenKey = await prisma.codexMatchKey.findFirst({
      where: { scopeId: r.scopeId, value: built.normalizedKey, codexItemId: { not: r.id } },
      select: { value: true },
    });
    if (takenKey) {
      clashes.push(`${r.displayName} → ${built.normalizedKey} (키 선점됨)`);
      continue;
    }

    if (APPLY) {
      // ⚠️ 도감과 PRIMARY 매칭 키를 한 트랜잭션으로 (D-197)
      await prisma.$transaction(async (tx) => {
        await tx.codexItem.update({
          where: { id: r.id },
          data: { normalizedKey: built.normalizedKey },
        });
        await tx.codexMatchKey.updateMany({
          where: { codexItemId: r.id, kind: "PRIMARY" },
          data: { value: built.normalizedKey },
        });
      });
    }
    fixed++;
  }

  console.log(`\n${APPLY ? "고침" : "고칠 것"} ${fixed}건 · 이미 맞음 ${same}건`);
  if (clashes.length) {
    console.log(`⚠️ 충돌 ${clashes.length}건 — 고르지 않고 남깁니다 (D-190)`);
    for (const c of clashes) console.log(`   · ${c}`);
  }
  if (skipped.length) {
    console.log(`⚠️ 건너뜀 ${skipped.length}건`);
    for (const s of skipped.slice(0, 10)) console.log(`   · ${s}`);
  }

  if (APPLY) {
    const bad = await prisma.codexItem.count({
      where: { subtypeId: { not: null }, normalizedKey: { endsWith: SEP } },
    });
    /*
      ⚠️ PRIMARY 값과 도감 키가 **같아야** 매칭이 닿는다 (D-197). Prisma 로는
      컬럼끼리 비교를 못 해 raw 로 센다 — 이 검산이 없으면 반쪽만 고쳐놓고
      끝났다고 착각한다
    */
    const [{ count: mismatch }] = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM "CodexMatchKey" k
      JOIN "CodexItem" i ON i.id = k."codexItemId"
      WHERE k.kind = 'PRIMARY' AND k.value <> i."normalizedKey"
    `;
    console.log(
      `\n검산 — 빈 칸으로 끝나는 키 ${bad}건 (0이어야 함)` +
        ` · 도감과 어긋난 PRIMARY ${Number(mismatch)}건 (0이어야 함)`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
