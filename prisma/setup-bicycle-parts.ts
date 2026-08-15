import "./env";
import { prisma } from "../src/lib/prisma";

/**
 * 자전거 부품 제품군 7종 + 전용 속성 시드 (D-212).
 *
 * ## ⚠️ 출처가 있다
 * REI 자전거 부품 분류와 각 부품의 업계 스펙 표기(Shimano 그룹셋 계층 ·
 * 핸들바 치수 표준 · 휠셋 림 높이/내폭 · 프레임 소재)를 따랐다.
 * D-208(캠핑)과 같은 방식이다 (공통 규칙 9 — 근거 없는 항목을 만들지 않는다).
 *
 * REI 분류를 **그대로 쓰지 않았다** — 리테일 필터라 훨씬 잘다(구동계 아래에만
 * 시프터·디레일러·BB·크랭크셋·체인링·카세트·체인 7종). **속성이 실제로 갈리는
 * 단위**로 묶었다.
 *
 * ## ⚠️ 이 제품군은 부품이다 — 완성차가 아니다
 * 자전거 아이템은 **제품군 미지정**이고, 부품이 `Item.parentId` 로 거기 매달린다
 * (D-211). 방 진열에는 부모(완성차)만 나온다.
 *
 * ## ⚠️ 이미 있는 속성을 재사용한다
 * `minWeight`(캠핑에서 생성)를 프레임·휠셋·안장이 그대로 쓴다. 같은 개념·같은
 * 단위인데 새로 만들면 **번역이 두 벌**이 된다 (D-010).
 *
 * 멱등하다.
 *
 *   pnpm attrs:bicycle-parts
 */

type Opt = { key: string; ko: string; ja: string; en: string };
type Def = {
  key: string;
  type: "text" | "number" | "select" | "boolean";
  ko: string;
  ja: string;
  en: string;
  unit?: { ko: string; ja: string; en: string };
  options?: Opt[];
};

/** 새로 만드는 커스텀 속성. `minWeight` 는 캠핑(D-208)에서 이미 만들었다 */
const DEFS: Def[] = [
  { key: "frameMaterial", type: "select", ko: "소재", ja: "素材", en: "Material",
    options: [
      { key: "carbon", ko: "카본", ja: "カーボン", en: "Carbon" },
      { key: "aluminum", ko: "알루미늄", ja: "アルミ", en: "Aluminum" },
      { key: "titanium", ko: "티타늄", ja: "チタン", en: "Titanium" },
      { key: "steel", ko: "크로몰리·스틸", ja: "クロモリ・スチール", en: "Steel" },
    ] },
  /*
    ⚠️ 공통 `size`(text)를 쓰지 않는다 — 옷·신발과 공유라 의미가 섞인다.
    자전거는 `52`·`M`·`54cm` 로 표기가 갈려 자유 텍스트가 맞다
  */
  { key: "frameSize", type: "text", ko: "프레임 사이즈", ja: "フレームサイズ", en: "Frame size" },

  // Shimano 계층이 컬렉터의 언어다 — SRAM·Campagnolo 도 같은 축으로 읽힌다
  { key: "groupsetTier", type: "text", ko: "등급", ja: "グレード", en: "Tier" },
  { key: "speeds", type: "number", ko: "단수", ja: "段数", en: "Speeds",
    unit: { ko: "단", ja: "速", en: "speed" } },
  { key: "shiftingType", type: "select", ko: "변속 방식", ja: "変速方式", en: "Shifting",
    options: [
      { key: "mechanical", ko: "기계식", ja: "機械式", en: "Mechanical" },
      { key: "electronic", ko: "전자식", ja: "電動", en: "Electronic" },
    ] },

  { key: "rimDepth", type: "number", ko: "림 높이", ja: "リムハイト", en: "Rim depth",
    unit: { ko: "mm", ja: "mm", en: "mm" } },
  { key: "innerWidth", type: "number", ko: "림 내폭", ja: "リム内幅", en: "Internal width",
    unit: { ko: "mm", ja: "mm", en: "mm" } },
  /*
    ⚠️ 휠셋과 브레이크가 **공유**한다. 같은 축이므로 따로 만들면 옵션 번역이
    두 벌이 되고 한쪽만 고쳐진다 (D-010 이 공통 라이브러리를 둔 이유)
  */
  { key: "brakeType", type: "select", ko: "브레이크 방식", ja: "ブレーキ方式", en: "Brake type",
    options: [
      { key: "disc", ko: "디스크", ja: "ディスク", en: "Disc" },
      { key: "rim", ko: "림", ja: "リム", en: "Rim" },
    ] },

  { key: "barWidth", type: "number", ko: "핸들바 폭", ja: "ハンドル幅", en: "Bar width",
    unit: { ko: "mm", ja: "mm", en: "mm" } },
  { key: "barDrop", type: "number", ko: "드롭", ja: "ドロップ", en: "Drop",
    unit: { ko: "mm", ja: "mm", en: "mm" } },
  { key: "barReach", type: "number", ko: "리치", ja: "リーチ", en: "Reach",
    unit: { ko: "mm", ja: "mm", en: "mm" } },
  { key: "clampDiameter", type: "number", ko: "클램프 지름", ja: "クランプ径", en: "Clamp diameter",
    unit: { ko: "mm", ja: "mm", en: "mm" } },

  { key: "saddleWidth", type: "number", ko: "안장 폭", ja: "サドル幅", en: "Saddle width",
    unit: { ko: "mm", ja: "mm", en: "mm" } },
  { key: "railMaterial", type: "select", ko: "레일 소재", ja: "レール素材", en: "Rail material",
    options: [
      { key: "carbon", ko: "카본", ja: "カーボン", en: "Carbon" },
      { key: "titanium", ko: "티타늄", ja: "チタン", en: "Titanium" },
      { key: "steel", ko: "스틸", ja: "スチール", en: "Steel" },
      { key: "alloy", ko: "합금", ja: "合金", en: "Alloy" },
    ] },

  // ETRTO·`700x25C` 표기가 섞여 자유 텍스트가 맞다
  { key: "tireSize", type: "text", ko: "타이어 규격", ja: "タイヤサイズ", en: "Tire size" },
  { key: "tubeless", type: "boolean", ko: "튜브리스", ja: "チューブレス", en: "Tubeless" },
];

const SUBTYPES: { key: string; ko: string; ja: string; en: string; attrs: string[] }[] = [
  { key: "frame", ko: "프레임", ja: "フレーム", en: "Frame",
    attrs: ["frameMaterial", "frameSize", "minWeight"] },
  { key: "drivetrain", ko: "구동계", ja: "駆動系", en: "Drivetrain",
    attrs: ["groupsetTier", "speeds", "shiftingType"] },
  { key: "wheelset", ko: "휠셋", ja: "ホイールセット", en: "Wheelset",
    attrs: ["rimDepth", "innerWidth", "brakeType", "minWeight"] },
  { key: "handlebar", ko: "핸들바", ja: "ハンドルバー", en: "Handlebar",
    attrs: ["barWidth", "barDrop", "barReach", "clampDiameter"] },
  { key: "saddle", ko: "안장", ja: "サドル", en: "Saddle",
    attrs: ["saddleWidth", "railMaterial", "minWeight"] },
  { key: "brakes", ko: "브레이크", ja: "ブレーキ", en: "Brakes", attrs: ["brakeType"] },
  { key: "tire", ko: "타이어", ja: "タイヤ", en: "Tire", attrs: ["tireSize", "tubeless"] },
];

async function main() {
  const category = await prisma.category.findUnique({
    where: { key: "bicycle" },
    select: { id: true },
  });
  if (!category) throw new Error("자전거 카테고리가 없습니다");

  let defCreated = 0;
  const defIds = new Map<string, string>();
  for (const d of DEFS) {
    const existing = await prisma.attributeDefinition.findUnique({
      where: { key: d.key },
      select: { id: true },
    });
    if (existing) {
      defIds.set(d.key, existing.id);
      continue;
    }
    const made = await prisma.attributeDefinition.create({
      data: {
        key: d.key,
        type: d.type,
        labelKo: d.ko, labelJa: d.ja, labelEn: d.en,
        unitKo: d.unit?.ko, unitJa: d.unit?.ja, unitEn: d.unit?.en,
        isCommon: false,
        options: d.options
          ? { create: d.options.map((o, i) => ({ key: o.key, labelKo: o.ko, labelJa: o.ja, labelEn: o.en, displayOrder: i })) }
          : undefined,
      },
      select: { id: true },
    });
    defIds.set(d.key, made.id);
    defCreated++;
  }

  // 캠핑에서 만든 것을 재사용한다 (D-010 — 같은 개념·같은 단위)
  const reused = await prisma.attributeDefinition.findUnique({
    where: { key: "minWeight" },
    select: { id: true },
  });
  if (!reused) throw new Error("`minWeight` 가 없습니다 — `pnpm attrs:camping` 을 먼저 실행하세요 (D-208)");
  defIds.set("minWeight", reused.id);

  let stCreated = 0;
  let attrCreated = 0;
  for (const [order, s] of SUBTYPES.entries()) {
    let st = await prisma.categorySubtype.findUnique({
      where: { categoryId_key: { categoryId: category.id, key: s.key } },
      select: { id: true },
    });
    if (!st) {
      st = await prisma.categorySubtype.create({
        data: {
          categoryId: category.id,
          key: s.key,
          labelKo: s.ko, labelJa: s.ja, labelEn: s.en,
          displayOrder: order,
        },
        select: { id: true },
      });
      stCreated++;
    }
    for (const [i, key] of s.attrs.entries()) {
      const defId = defIds.get(key);
      if (!defId) throw new Error(`속성 정의가 없습니다: ${key}`);
      const has = await prisma.categoryAttribute.findUnique({
        where: { subtypeId_attributeDefinitionId: { subtypeId: st.id, attributeDefinitionId: defId } },
        select: { id: true },
      });
      if (has) continue;
      await prisma.categoryAttribute.create({
        // 스펙 값은 모르는 경우가 흔하다. 필수로 걸면 등록이 막힌다 (원칙 3)
        data: { subtypeId: st.id, attributeDefinitionId: defId, required: false, displayOrder: i },
      });
      attrCreated++;
    }
  }

  console.log(`속성 정의  : 신규 ${defCreated} / 전체 ${DEFS.length} (+ minWeight 재사용)`);
  console.log(`제품군     : 신규 ${stCreated} / 전체 ${SUBTYPES.length}`);
  console.log(`전용 속성  : 신규 ${attrCreated}`);
  console.log(
    "\n⚠️ 매칭 키는 카테고리 기본(brand+model+year)을 그대로 쓴다 — 부품에도 세대가 의미 있고 모델명이 이미 담는다 (D-212)",
  );
  console.log("⚠️ 완성차는 제품군 미지정이다. 부품이 Item.parentId 로 거기 매달린다 (D-211)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
