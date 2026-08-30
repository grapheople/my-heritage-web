import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * 자전거 **프레임에 사이즈를 필수로** 만든다 (D-290).
 *
 * ## ⚠️ 사이즈 칸이 둘이었다
 * 자전거 공통에 `size`(사이즈)가, 프레임 종류에 `frameSize`(프레임 사이즈)가
 * 각각 붙어 있어 **프레임 폼에 사이즈 입력칸이 두 개** 떴다. 유저가 어디에
 * 써야 할지 알 수 없고, 나뉘어 들어가면 나중에 합칠 수도 없다.
 *
 * 프레임은 `52`·`56` 같은 **자전거 고유 체계**를 쓰므로 전용 속성이 맞다.
 * 공통 `size` 는 자전거에서 **끈다.**
 *
 * ## ⚠️ 지우지 않고 **비활성화**한다 (D-036)
 * `ItemAttributeValue` 가 `onDelete: Restrict` 로 물려 있어 값이 하나라도
 * 있으면 삭제가 막힌다. 지금은 0건이지만 **삭제는 되돌릴 수 없다** — 조회는
 * `active: true` 만 보므로 끄는 것으로 화면에서 사라진다.
 *
 * ⚠️ **다른 카테고리의 `size` 는 건드리지 않는다** — 신발·옷은 그대로 쓴다.
 *
 * ⚠️ **도감 식별값이 아니다.** 사이즈로 도감을 나누면 같은 프레임을 가진
 * 사람들이 서로 다른 항목으로 흩어진다 — 수집 프롬프트가 "사이즈는 언제나
 * 같은 제품" 이라고 못박아 둔 것과 같은 이유다. 매칭 키는 `{brand, model}`
 * 그대로 둔다.
 *
 * ```
 * pnpm tsx prisma/set-frame-size-required.ts          # 미리보기
 * pnpm tsx prisma/set-frame-size-required.ts --apply
 * ```
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`대상 DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}`);
  console.log(APPLY ? "모드: 적용\n" : "모드: 미리보기 (--apply 로 적용)\n");

  // ── ① 프레임의 frameSize 를 필수로 ──
  const frameSize = await prisma.categoryAttribute.findFirst({
    where: {
      subtype: { key: "frame", category: { key: "bicycle" } },
      attributeDefinition: { key: "frameSize" },
    },
    select: { id: true, required: true, active: true },
  });
  if (!frameSize) throw new Error("프레임의 frameSize 속성이 없다 — A-02 에서 먼저 붙여야 한다");

  console.log(`① frameSize — 현재 필수=${frameSize.required} active=${frameSize.active} → 필수=true active=true`);
  if (APPLY) {
    await prisma.categoryAttribute.update({
      where: { id: frameSize.id },
      data: { required: true, active: true },
    });
  }

  // ── ② 자전거 공통 size 를 끈다 ──
  const commonSize = await prisma.categoryAttribute.findFirst({
    where: {
      category: { key: "bicycle" },
      subtypeId: null,
      attributeDefinition: { key: "size" },
    },
    select: { id: true, active: true },
  });
  if (!commonSize) {
    console.log("② 자전거 공통 size — 없음 (이미 정리됐다)");
  } else {
    /*
      ⚠️ **값이 있으면 끄기 전에 알린다.** 끄면 화면에서 사라지지만 값은
      남는다 — 유저가 입력한 것을 조용히 감추는 셈이라 건수를 밝힌다
    */
    const values = await prisma.itemAttributeValue.count({
      where: { categoryAttributeId: commonSize.id },
    });
    console.log(`② 자전거 공통 size — active=${commonSize.active} → false · 입력된 값 ${values}건`);
    if (values > 0) {
      console.log(`   ⚠️ 값이 ${values}건 있다. 끄면 화면에서만 사라지고 데이터는 남는다`);
    }
    if (APPLY) {
      await prisma.categoryAttribute.update({
        where: { id: commonSize.id },
        data: { active: false },
      });
    }
  }

  if (APPLY) {
    const shown = await prisma.categoryAttribute.findMany({
      where: {
        active: true,
        attributeDefinition: { key: { in: ["size", "frameSize"] } },
        OR: [
          { category: { key: "bicycle" }, subtypeId: null },
          { subtype: { category: { key: "bicycle" } } },
        ],
      },
      select: {
        required: true,
        attributeDefinition: { select: { key: true, labelKo: true } },
        subtype: { select: { key: true } },
      },
    });
    console.log(`\n검산 — 자전거에서 살아 있는 사이즈 속성 ${shown.length}개 (1개여야 함)`);
    for (const a of shown) {
      console.log(`   ${a.attributeDefinition.key} (${a.attributeDefinition.labelKo}) · 종류=${a.subtype?.key ?? "공통"} · 필수=${a.required}`);
    }
    // 다른 카테고리는 그대로여야 한다
    const others = await prisma.categoryAttribute.count({
      where: { active: true, subtypeId: null, attributeDefinition: { key: "size" } },
    });
    console.log(`   다른 카테고리의 공통 size ${others}개 (신발·옷 = 2개여야 함)`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
