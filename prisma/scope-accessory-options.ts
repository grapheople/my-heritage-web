import "./env";
import { prisma } from "../src/lib/prisma";

/**
 * 카테고리 전용 선택지 스코프 (D-209, OI-99 해소).
 *
 * ## ⚠️ 무엇이 문제였나
 * 캠핑 텐트 등록 폼의 `포함 부속품` 에 **"여분 링크"**(시계 브레이슬릿 링크)가
 * 떴다. 신발·데스크테리어도 같았다.
 *
 * 공통 속성 라이브러리(D-010)의 목적은 **번역 재사용**이다. `포함 부속품`
 * 이라는 **개념은 공통**이 맞다 — 어느 카테고리든 "무엇이 함께 왔는가"가 있다.
 * 그런데 **선택지는 카테고리마다 다르다.** 그 층이 없었다.
 *
 * ## ⚠️ 실측으로 범위를 좁혔다
 * 선택지를 가진 속성 11개 중 **`accessories` 하나만** 문제다.
 * `condition`(새제품·미사용·사용감…)은 전부 카테고리 중립이고, 나머지 9개는
 * 커스텀이라 애초에 한 카테고리에만 붙는다.
 *
 * ## ⚠️ 캠핑용 부속품을 만들지 않았다
 * 폴·팩·이너텐트 같은 것을 **추측으로 넣지 않는다** (공통 규칙 9).
 * 근거가 생기면 그때 추가한다.
 *
 * 멱등하다.
 *
 *   pnpm attrs:scope-options
 */

/** `옵션 key` → 이 카테고리에서만 보인다 */
const SCOPED: { optionKey: string; categoryKey: string; why: string }[] = [
  {
    optionKey: "spareLinks",
    categoryKey: "watch",
    why: "브레이슬릿 여분 링크 — 시계에만 있는 개념",
  },
];

async function main() {
  const accessories = await prisma.attributeDefinition.findUnique({
    where: { key: "accessories" },
    select: { id: true, options: { select: { id: true, key: true, labelKo: true, categoryId: true } } },
  });
  if (!accessories) throw new Error("accessories 속성이 없습니다");

  console.log("현재 `포함 부속품` 선택지:");
  for (const o of accessories.options) {
    console.log(`  ${o.key.padEnd(14)} ${o.labelKo.padEnd(10)} ${o.categoryId ? "(스코프됨)" : "(공통)"}`);
  }
  console.log();

  let changed = 0;
  for (const s of SCOPED) {
    const category = await prisma.category.findUnique({
      where: { key: s.categoryKey },
      select: { id: true },
    });
    if (!category) throw new Error(`카테고리가 없습니다: ${s.categoryKey}`);

    const opt = accessories.options.find((o) => o.key === s.optionKey);
    if (!opt) {
      // 조용히 넘기지 않는다 — key 가 바뀌었는데 모르고 지나가면 문제가 남는다
      console.log(`⚠️ 선택지를 찾지 못했습니다: ${s.optionKey} — 건너뜁니다`);
      continue;
    }
    if (opt.categoryId === category.id) continue; // 멱등

    await prisma.attributeOption.update({
      where: { id: opt.id },
      data: { categoryId: category.id },
    });
    console.log(`✓ ${opt.labelKo} → ${s.categoryKey} 전용 (${s.why})`);
    changed++;
  }

  console.log(`\n변경 ${changed}건`);
  console.log(
    "⚠️ 옵션 추가·스코프 변경 화면은 아직 없다 — A-02 의 선택지 입력칸은 목업이다 (OI-100)",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
