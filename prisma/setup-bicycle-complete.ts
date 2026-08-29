import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * 자전거 `완성차` 종류 신설 + 기존 도감 이관 (D-256).
 *
 * ## ⚠️ 종류 7개가 전부 부품이라 완성차가 고를 것이 없었다
 * 프레임·구동계·휠셋·핸들바·안장·브레이크·타이어. 종류를 필수로 만들면
 * (D-253) **완성차가 등록되지 않는다.**
 *
 * 기존 자전거 도감 105건은 **전부 완성차**다 (`Trek Domane SL 6` ·
 * `Specialized Tarmac SL7` · `Canyon Ultimate CF SL` …) — 부품 도감은 0건이다.
 * 그래서 일괄 이관이 기계적으로 가능하다.
 *
 * ## ⚠️ 도감과 매칭 키를 **함께** 옮긴다
 * `CodexMatchKey` 는 `subtypeId` 사본을 갖고, 그 둘로 `scopeId` 가 계산된다.
 * 도감만 옮기면 **매칭 키가 카테고리 스코프에 남아 도감과 갈린다** — 옮긴
 * 도감을 매칭이 영원히 못 찾는다.
 *
 * ## ⚠️ 멱등하다
 * 두 번 돌려도 종류가 중복 생성되지 않고, 이미 옮긴 도감은 건너뛴다.
 *
 * ```
 * pnpm tsx prisma/setup-bicycle-complete.ts          # 미리보기
 * pnpm tsx prisma/setup-bicycle-complete.ts --apply  # 실제 적용
 * ```
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`대상 DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}`);
  console.log(APPLY ? "모드: 적용\n" : "모드: 미리보기 (--apply 로 실제 적용)\n");

  const bicycle = await prisma.category.findUnique({
    where: { key: "bicycle" },
    select: { id: true },
  });
  if (!bicycle) throw new Error("자전거 카테고리가 없습니다");

  // ── 1. 완성차 종류 ────────────────────────────────────────────────────
  const existing = await prisma.categorySubtype.findUnique({
    where: { categoryId_key: { categoryId: bicycle.id, key: "complete" } },
    select: { id: true },
  });

  let completeId = existing?.id;
  if (existing) {
    console.log("① 완성차 종류: 이미 있음");
  } else if (APPLY) {
    /*
      ⚠️ `displayOrder: -1` 로 **부품보다 앞에** 둔다. 기존 7개의 순서를
      건드리지 않으면서 완성차를 첫 선택지로 만든다 — 대부분의 유저가 고를
      것이고, 목록 맨 아래 있으면 부품 중 하나로 오인된다.
    */
    const made = await prisma.categorySubtype.create({
      data: {
        categoryId: bicycle.id,
        key: "complete",
        labelKo: "완성차",
        labelJa: "完成車",
        labelEn: "Complete bike",
        displayOrder: -1,
      },
      select: { id: true },
    });
    completeId = made.id;
    console.log("① 완성차 종류: 생성함");
  } else {
    console.log("① 완성차 종류: 생성 예정");
  }

  // ── 2. 기존 도감 이관 ─────────────────────────────────────────────────
  const toMove = await prisma.codexItem.count({
    where: { categoryId: bicycle.id, subtypeId: null },
  });
  console.log(`② 이관 대상 도감: ${toMove}건`);

  if (toMove > 0 && APPLY && completeId) {
    const codex = await prisma.codexItem.updateMany({
      where: { categoryId: bicycle.id, subtypeId: null },
      data: { subtypeId: completeId },
    });
    // ⚠️ 매칭 키를 **함께** 옮긴다 — 안 옮기면 도감과 scope 가 갈린다
    const keys = await prisma.codexMatchKey.updateMany({
      where: { categoryId: bicycle.id, subtypeId: null },
      data: { subtypeId: completeId },
    });
    console.log(`   도감 ${codex.count}건 · 매칭 키 ${keys.count}건 이관`);
  }

  // ── 3. 기존 아이템 이관 ───────────────────────────────────────────────
  const items = await prisma.item.count({
    where: { categoryId: bicycle.id, subtypeId: null, parentId: null },
  });
  console.log(`③ 이관 대상 아이템(완성차): ${items}건`);

  if (items > 0 && APPLY && completeId) {
    /*
      ⚠️ **`parentId: null` 인 것만** 옮긴다. 부품으로 달린 아이템은 어느 부품
      종류인지 알 수 없으므로 사람이 정해야 한다 — 임의로 완성차를 붙이면
      휠셋이 완성차로 기록된다.
    */
    const moved = await prisma.item.updateMany({
      where: { categoryId: bicycle.id, subtypeId: null, parentId: null },
      data: { subtypeId: completeId },
    });
    console.log(`   아이템 ${moved.count}건 이관`);
  }

  const orphanParts = await prisma.item.count({
    where: { categoryId: bicycle.id, subtypeId: null, parentId: { not: null } },
  });
  if (orphanParts > 0) {
    console.log(`⚠️ 종류 없는 부품 아이템 ${orphanParts}건 — 사람이 정해야 합니다`);
  }

  // ── 4. 검산 ───────────────────────────────────────────────────────────
  if (APPLY) {
    const left = await prisma.codexItem.count({
      where: { categoryId: bicycle.id, subtypeId: null },
    });
    const mismatched = await prisma.codexMatchKey.count({
      where: { categoryId: bicycle.id, subtypeId: null },
    });
    console.log(`\n검산 — 카테고리 스코프 잔여: 도감 ${left}건 · 매칭 키 ${mismatched}건 (0이어야 함)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
