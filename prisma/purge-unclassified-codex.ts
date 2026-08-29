import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * 종류를 정할 수 없는 도감을 **지운다** (D-261).
 *
 * ## ⚠️ 옮기지 않고 지우는 이유
 * 남은 것은 두 종류다:
 * - **다른 카테고리 제품** — Danner·Columbia 부츠·재킷, Salomon 러닝화. 신발·옷
 *   카테고리 소관이고 거기 이미 85·339건이 있어 **재수집이 이동보다 싸다**
 * - **종류 체계에 없는 것** — 베개·드라이색·정수필터·보냉제·야전침대. 종류를
 *   더 만들 만큼 모수가 크지 않다(각 1~2건)
 *
 * `db:fix-camping-mix`(D-216·OI-101)와 같은 판단이다.
 *
 * ## ⚠️ 보유자가 있으면 멈춘다
 * `Item.codexItemId` 는 `SetNull` 이라 아이템은 살아남지만 **도감 연결을 잃는다.**
 * 유저 화면에서 명칭이 `brand + model` 파생으로 바뀌고(D-073) 도감 페이지의
 * 보유자 목록에서 사라진다. 그것을 말없이 하지 않는다.
 *
 * ## ⚠️ 병합 흡수분이 있으면 멈춘다
 * `mergedIntoId` 가 이 도감을 가리키는 것이 있으면, 지울 때 그 연결이 끊겨
 * **되돌리기가 절반만 되는 상태**가 된다 (D-181 이 고친 문제).
 *
 * `CodexMatchKey` 는 `onDelete: Cascade` 라 함께 사라진다.
 *
 * ```
 * pnpm tsx prisma/purge-unclassified-codex.ts camping          # 미리보기
 * pnpm tsx prisma/purge-unclassified-codex.ts camping --apply
 * ```
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const argv = process.argv.slice(2);
  const categoryKey = argv.find((a) => !a.startsWith("--"));
  const APPLY = argv.includes("--apply");
  if (!categoryKey) {
    console.log("사용법: pnpm tsx prisma/purge-unclassified-codex.ts <카테고리> [--apply]");
    return;
  }
  console.log(`대상 DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}`);
  console.log(APPLY ? "모드: 적용\n" : "모드: 미리보기 (--apply 로 적용)\n");

  const cat = await prisma.category.findUnique({
    where: { key: categoryKey },
    select: { id: true },
  });
  if (!cat) throw new Error(`카테고리 '${categoryKey}' 가 없습니다`);

  const targets = await prisma.codexItem.findMany({
    where: { categoryId: cat.id, subtypeId: null, mergedIntoId: null },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true },
  });
  console.log(`삭제 대상 ${targets.length}건`);
  if (targets.length === 0) return;

  const ids = targets.map((t) => t.id);

  // ── 안전 검사 ─────────────────────────────────────────────────────────
  const owned = await prisma.item.count({ where: { codexItemId: { in: ids } } });
  if (owned > 0) {
    console.log(`\n⚠️ 연결된 유저 아이템 ${owned}건 — 지우면 도감 연결을 잃습니다. 중단.`);
    return;
  }
  const merged = await prisma.codexItem.count({ where: { mergedIntoId: { in: ids } } });
  if (merged > 0) {
    console.log(`\n⚠️ 이 도감으로 병합된 것이 ${merged}건 — 되돌리기가 깨집니다. 중단.`);
    return;
  }
  console.log("보유자 0명 · 병합 흡수 0건 확인");

  if (!APPLY) {
    console.log("\n지울 목록:");
    for (const t of targets) console.log(`  · ${t.displayName}`);
    console.log("\n⚠️ --apply 로 실제 삭제합니다. 되돌릴 수 없습니다.");
    return;
  }

  // `CodexMatchKey` 는 Cascade 로 함께 사라진다
  const res = await prisma.codexItem.deleteMany({ where: { id: { in: ids } } });
  const left = await prisma.codexItem.count({
    where: { categoryId: cat.id, subtypeId: null, mergedIntoId: null },
  });
  const orphanKeys = await prisma.codexMatchKey.count({ where: { codexItemId: { in: ids } } });
  console.log(`\n삭제 ${res.count}건`);
  console.log(`검산 — 남은 미분류 ${left}건 (0이어야 함) · 고아 매칭키 ${orphanKeys}건 (0이어야 함)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
