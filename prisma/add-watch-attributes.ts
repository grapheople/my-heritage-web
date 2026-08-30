import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * 시계에 스펙 속성 7종을 더한다 (D-291).
 *
 * ## ⚠️ `thickness` 를 재사용하지 않는다
 * 이미 있는 `thickness` 는 **단위가 `cm` 이고 캠핑 매트에 붙어** 있다. 단위는
 * `AttributeDefinition` 에 있어 **키 하나가 단위 하나**다 — 재사용하면 시계
 * 두께가 `cm` 로 뜬다. 그래서 `caseThickness`(mm) 를 따로 만든다.
 *
 * ## ⚠️ 라벨·단위는 3개 언어를 함께 채운다
 * 커스텀 속성은 ko/ja/en 필수다 (D-010). 단위도 3개 필드를 갖는다 (D-038) —
 * 기호가 같아도(`mm`) 채워야 한다. 하나만 채우면 그 언어 유저만 다른 것을 본다.
 *
 * ## ⚠️ 전부 **선택 입력**이다
 * 필수로 걸면 기존 도감·아이템이 값 없이 남아 있는데 등록·수정이 막힌다.
 * 필요하면 A-02 에서 나중에 켠다 (D-290 이 프레임 사이즈에 한 방식).
 *
 * ## ⚠️ 매칭 키는 건드리지 않는다
 * 시계 매칭 키는 `["uniqueId"]` 그대로다. 스펙은 **같은 레퍼런스를 가르는 값이
 * 아니다** — 케이스 지름으로 도감을 나누면 같은 시계가 흩어진다.
 *
 * ```
 * pnpm tsx prisma/add-watch-attributes.ts          # 미리보기
 * pnpm tsx prisma/add-watch-attributes.ts --apply
 * ```
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const APPLY = process.argv.includes("--apply");

type Spec = {
  key: string;
  type: "number" | "select";
  ko: string; ja: string; en: string;
  unit?: [string, string, string];
  options?: { key: string; ko: string; ja: string; en: string }[];
};

/** 표시 순서는 `condition`(6) 앞에 넣는다 — 스펙이 상태보다 먼저 온다 */
const SPECS: Spec[] = [
  {
    key: "movement", type: "select",
    ko: "무브먼트", ja: "ムーブメント", en: "Movement",
    /*
      ⚠️ 널리 쓰이는 것만 넣는다. 스프링 드라이브·솔라 같은 브랜드 고유 방식은
      필요해지면 A-02 에서 더한다 — 지금 없는 근거로 미리 넣지 않는다
    */
    options: [
      { key: "automatic", ko: "오토매틱", ja: "自動巻き", en: "Automatic" },
      { key: "manual", ko: "수동", ja: "手巻き", en: "Manual winding" },
      { key: "quartz", ko: "쿼츠", ja: "クォーツ", en: "Quartz" },
    ],
  },
  { key: "caseDiameter", type: "number", ko: "케이스 지름", ja: "ケース径", en: "Case diameter", unit: ["mm", "mm", "mm"] },
  { key: "lugToLug", type: "number", ko: "러그투러그", ja: "ラグ幅（縦）", en: "Lug-to-lug", unit: ["mm", "mm", "mm"] },
  { key: "lugWidth", type: "number", ko: "러그 폭", ja: "ラグ幅", en: "Lug width", unit: ["mm", "mm", "mm"] },
  // ⚠️ `thickness`(cm·매트)와 **다른 키**다 — 위 주석 참조
  { key: "caseThickness", type: "number", ko: "두께", ja: "厚さ", en: "Thickness", unit: ["mm", "mm", "mm"] },
  { key: "powerReserve", type: "number", ko: "파워리저브", ja: "パワーリザーブ", en: "Power reserve", unit: ["시간", "時間", "h"] },
  // 0 = 생활방수 없음. 단위를 m 로 두면 정렬·비교가 된다
  { key: "waterResistance", type: "number", ko: "방수", ja: "防水", en: "Water resistance", unit: ["m", "m", "m"] },
];

async function main() {
  console.log(`대상 DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}`);
  console.log(APPLY ? "모드: 적용\n" : "모드: 미리보기 (--apply 로 적용)\n");

  const cat = await prisma.category.findUnique({ where: { key: "watch" }, select: { id: true } });
  if (!cat) throw new Error("시계 카테고리가 없다");

  /*
    ⚠️ `condition` 뒤 순서를 밀지 않고 **그 앞 빈 자리**를 쓴다. 기존 속성의
    `displayOrder` 를 바꾸면 다른 카테고리와 무관한 변경이 섞인다
  */
  const existing = await prisma.categoryAttribute.findMany({
    where: { categoryId: cat.id },
    select: { displayOrder: true },
  });
  let order = Math.max(...existing.map((e) => e.displayOrder), 0) + 1;

  for (const s of SPECS) {
    // ── 정의 ──
    const def = await prisma.attributeDefinition.upsert({
      where: { key: s.key },
      update: {},
      create: {
        key: s.key,
        type: s.type,
        labelKo: s.ko, labelJa: s.ja, labelEn: s.en,
        unitKo: s.unit?.[0], unitJa: s.unit?.[1], unitEn: s.unit?.[2],
        // 카테고리 전용 커스텀 — 3개 언어를 직접 채웠다 (D-010)
        isCommon: false,
      },
      select: { id: true, key: true, labelKo: true },
    });

    // ── 선택지 (select 만) ──
    if (s.options) {
      for (const [i, o] of s.options.entries()) {
        const has = await prisma.attributeOption.findFirst({
          where: { attributeDefinitionId: def.id, key: o.key, categoryId: null },
          select: { id: true },
        });
        if (!has && APPLY) {
          await prisma.attributeOption.create({
            data: {
              attributeDefinitionId: def.id, key: o.key,
              labelKo: o.ko, labelJa: o.ja, labelEn: o.en,
              displayOrder: i,
            },
          });
        }
      }
    }

    // ── 카테고리에 붙이기 ──
    const linked = await prisma.categoryAttribute.findFirst({
      where: { categoryId: cat.id, attributeDefinitionId: def.id },
      select: { id: true, active: true },
    });
    if (linked) {
      console.log(`  ${s.key.padEnd(16)} 이미 붙어 있음 (active=${linked.active})`);
      continue;
    }
    console.log(`  ${s.key.padEnd(16)} ${s.ko.padEnd(10)} ${s.type.padEnd(7)} 단위=${s.unit?.[0] ?? "-"} 순서=${order}${s.options ? ` 선택지 ${s.options.length}개` : ""}`);
    if (APPLY) {
      await prisma.categoryAttribute.create({
        data: {
          categoryId: cat.id,
          attributeDefinitionId: def.id,
          // ⚠️ 선택 입력이다 — 필수로 걸면 기존 아이템 수정이 막힌다
          required: false,
          active: true,
          displayOrder: order,
        },
      });
    }
    order++;
  }

  if (APPLY) {
    const all = await prisma.categoryAttribute.count({ where: { categoryId: cat.id, active: true } });
    const added = await prisma.categoryAttribute.count({
      where: { categoryId: cat.id, attributeDefinition: { key: { in: SPECS.map((s) => s.key) } } },
    });
    const mk = await prisma.matchingKeyDefinition.findFirst({ where: { categoryId: cat.id }, select: { attributeKeys: true } });
    console.log(`\n검산 — 시계 활성 속성 ${all}개 · 이번에 붙인 것 ${added}/7 · 매칭 키 ${JSON.stringify(mk?.attributeKeys)} (변경 없어야 함)`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
