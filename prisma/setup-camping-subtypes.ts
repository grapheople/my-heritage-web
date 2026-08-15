import "./env";
import { prisma } from "../src/lib/prisma";

/**
 * 캠핑 하위 제품군 8종 + 전용 속성 시드 (D-208).
 *
 * ## ⚠️ 출처가 있다 — 추측이 아니다
 * REI 캠핑·하이킹 분류와 각 제품군의 **스펙 표기 항목**을 따랐다. D-166 이
 * 운동 카테고리를 만들 때 `free-exercise-db` 공개 스키마에서 고른 것과 같은
 * 방식이다 (공통 규칙 9 — 근거 없는 항목을 만들지 않는다).
 *
 * REI 분류를 **그대로 쓰지는 않았다.** 리테일 필터라 훨씬 잘고(Tents 아래에만
 * 9종), 우리는 **속성이 실제로 갈리는 단위**로 묶었다 — 제품군이 늘수록
 * 어드민 부담이 커지고 도감 연결도 희석된다 (원칙 4).
 *
 * ## ⚠️ 멱등하다
 * 다시 돌려도 중복이 생기지 않는다. 이미 있는 것은 건드리지 않는다 —
 * 어드민이 화면에서 라벨을 고쳤을 수 있고 그것을 덮어쓰면 안 된다.
 *
 * ## ⚠️ 제품군 전용 매칭 키는 만들지 않는다
 * D-195 가 캠핑을 "제조사 품번 우선, 없으면 제품명"으로 이미 정리했고
 * **제품군마다 다르게 할 근거가 아직 없다.** 구조는 D-207 로 열려 있으니
 * 근거가 생기면 A-03 에서 설정한다.
 *
 *   pnpm attrs:camping
 */

type Opt = { key: string; ko: string; ja: string; en: string };
type Def = {
  key: string;
  type: "text" | "number" | "select";
  ko: string;
  ja: string;
  en: string;
  unit?: { ko: string; ja: string; en: string };
  options?: Opt[];
};

/** 새로 만드는 커스텀 속성 정의 (D-010 — 커스텀은 3개 언어 필수) */
const DEFS: Def[] = [
  // ⚠️ `capacity` 로 합치지 않았다 — 텐트는 "인", 쿨러는 "L" 로 **단위가 다르다**.
  // 단위는 AttributeDefinition 에 있어서(FR-02-A-08) 같은 key 면 한쪽이 틀린다
  { key: "sleepsCount", type: "number", ko: "수용 인원", ja: "収容人数", en: "Capacity",
    unit: { ko: "인", ja: "人", en: "people" } },
  { key: "seasonRating", type: "select", ko: "계절", ja: "シーズン", en: "Seasons",
    options: [
      { key: "3season", ko: "3계절", ja: "3シーズン", en: "3-season" },
      { key: "3-4season", ko: "3-4계절", ja: "3-4シーズン", en: "3-4 season" },
      { key: "4season", ko: "동계(4계절)", ja: "冬季(4シーズン)", en: "4-season" },
    ] },
  { key: "floorArea", type: "number", ko: "바닥 면적", ja: "床面積", en: "Floor area",
    unit: { ko: "㎡", ja: "㎡", en: "m²" } },
  { key: "peakHeight", type: "number", ko: "최고 높이", ja: "最高高さ", en: "Peak height",
    unit: { ko: "cm", ja: "cm", en: "cm" } },
  // REI 의 "minimum trail weight" — 본체·플라이·폴만의 무게
  { key: "minWeight", type: "number", ko: "최소 무게", ja: "最小重量", en: "Minimum weight",
    unit: { ko: "g", ja: "g", en: "g" } },

  // REI 는 comfort / lower limit 두 값을 쓴다. 컬렉터가 먼저 보는 것은 comfort 다
  { key: "comfortTemp", type: "number", ko: "사용 가능 온도", ja: "快適使用温度", en: "Comfort rating",
    unit: { ko: "℃", ja: "℃", en: "°C" } },
  { key: "fillType", type: "select", ko: "충전재", ja: "中綿", en: "Fill type",
    options: [
      { key: "down", ko: "다운", ja: "ダウン", en: "Down" },
      { key: "synthetic", ko: "화학솜", ja: "化繊", en: "Synthetic" },
    ] },
  { key: "fillPower", type: "number", ko: "필파워", ja: "フィルパワー", en: "Fill power" },

  { key: "rValue", type: "number", ko: "R-value", ja: "R値", en: "R-value" },
  { key: "thickness", type: "number", ko: "두께", ja: "厚さ", en: "Thickness",
    unit: { ko: "cm", ja: "cm", en: "cm" } },
  { key: "padType", type: "select", ko: "매트 방식", ja: "マットタイプ", en: "Pad type",
    options: [
      { key: "air", ko: "에어", ja: "エアー", en: "Air" },
      { key: "self-inflating", ko: "자동 팽창", ja: "自動膨張", en: "Self-inflating" },
      { key: "foam", ko: "폼", ja: "フォーム", en: "Closed-cell foam" },
    ] },

  /*
    ⚠️ 연료를 하나로 합치지 않았다 — 합치면 **랜턴 폼에 "장작"이, 버너 폼에
    "USB 충전"이** 뜬다. 선택지가 맞지 않는 칸은 유저에게 "이 서비스가 내 물건을
    모른다"로 읽힌다
  */
  { key: "fuelType", type: "select", ko: "연료", ja: "燃料", en: "Fuel",
    options: [
      { key: "isobutane", ko: "이소부탄", ja: "イソブタン", en: "Isobutane" },
      { key: "lpg", ko: "LPG", ja: "LPG", en: "LPG" },
      { key: "liquid", ko: "휘발유", ja: "ホワイトガソリン", en: "Liquid fuel" },
      { key: "alcohol", ko: "알코올", ja: "アルコール", en: "Alcohol" },
      { key: "wood", ko: "장작", ja: "薪", en: "Wood" },
    ] },
  { key: "burnerCount", type: "number", ko: "화구 수", ja: "バーナー数", en: "Burners",
    unit: { ko: "구", ja: "口", en: "burners" } },
  { key: "outputBtu", type: "number", ko: "출력", ja: "出力", en: "Output",
    unit: { ko: "BTU", ja: "BTU", en: "BTU" } },

  { key: "lumens", type: "number", ko: "광량", ja: "明るさ", en: "Brightness",
    unit: { ko: "lm", ja: "lm", en: "lm" } },
  { key: "powerSource", type: "select", ko: "전원", ja: "電源", en: "Power source",
    options: [
      { key: "gas", ko: "가스", ja: "ガス", en: "Gas" },
      { key: "oil", ko: "오일", ja: "オイル", en: "Liquid fuel" },
      { key: "battery", ko: "건전지", ja: "乾電池", en: "Battery" },
      { key: "rechargeable", ko: "충전식", ja: "充電式", en: "Rechargeable" },
    ] },
  { key: "runtimeHours", type: "number", ko: "점등 시간", ja: "点灯時間", en: "Runtime",
    unit: { ko: "시간", ja: "時間", en: "hours" } },

  { key: "maxLoad", type: "number", ko: "내하중", ja: "耐荷重", en: "Max load",
    unit: { ko: "kg", ja: "kg", en: "kg" } },

  { key: "capacityLiters", type: "number", ko: "용량", ja: "容量", en: "Capacity",
    unit: { ko: "L", ja: "L", en: "L" } },
  { key: "iceRetentionDays", type: "number", ko: "보냉 시간", ja: "保冷時間", en: "Ice retention",
    unit: { ko: "일", ja: "日", en: "days" } },
];

/** 제품군 → 전용 속성 key. `size`·`color` 같은 공통 속성은 이미 카테고리에 있다 */
const SUBTYPES: { key: string; ko: string; ja: string; en: string; attrs: string[] }[] = [
  { key: "tent", ko: "텐트", ja: "テント", en: "Tent",
    attrs: ["sleepsCount", "seasonRating", "floorArea", "peakHeight", "minWeight"] },
  { key: "tarp", ko: "타프", ja: "タープ", en: "Tarp",
    attrs: ["peakHeight", "minWeight"] },
  { key: "sleeping-bag", ko: "침낭", ja: "寝袋", en: "Sleeping bag",
    attrs: ["comfortTemp", "fillType", "fillPower", "minWeight"] },
  { key: "sleeping-pad", ko: "매트", ja: "マット", en: "Sleeping pad",
    attrs: ["rValue", "thickness", "padType", "minWeight"] },
  { key: "stove", ko: "버너·화로", ja: "バーナー", en: "Stove",
    attrs: ["fuelType", "burnerCount", "outputBtu"] },
  { key: "lantern", ko: "랜턴", ja: "ランタン", en: "Lantern",
    attrs: ["lumens", "powerSource", "runtimeHours"] },
  { key: "furniture", ko: "체어·테이블", ja: "チェア・テーブル", en: "Furniture",
    attrs: ["maxLoad"] },
  { key: "cooler", ko: "쿨러", ja: "クーラーボックス", en: "Cooler",
    attrs: ["capacityLiters", "iceRetentionDays"] },
];

async function main() {
  const category = await prisma.category.findUnique({
    where: { key: "camping" },
    select: { id: true },
  });
  if (!category) throw new Error("캠핑 카테고리가 없습니다");

  /* ── 속성 정의 (멱등) ── */
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
        // 카테고리 전용 커스텀이다 — 공통 라이브러리가 아니다 (D-010)
        isCommon: false,
        options: d.options
          ? {
              create: d.options.map((o, i) => ({
                key: o.key,
                labelKo: o.ko, labelJa: o.ja, labelEn: o.en,
                displayOrder: i,
              })),
            }
          : undefined,
      },
      select: { id: true },
    });
    defIds.set(d.key, made.id);
    defCreated++;
  }

  /* ── 제품군 + 전용 속성 (멱등) ── */
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
        // ⚠️ `categoryId` 를 넣지 않는다 — 제품군 전용 행이다 (카테고리 XOR 제품군)
        data: {
          subtypeId: st.id,
          attributeDefinitionId: defId,
          // 스펙 값은 모르는 경우가 흔하다. 필수로 걸면 등록이 막힌다 (원칙 3)
          required: false,
          displayOrder: i,
        },
      });
      attrCreated++;
    }
  }

  console.log(`속성 정의  : 신규 ${defCreated} / 전체 ${DEFS.length}`);
  console.log(`제품군     : 신규 ${stCreated} / 전체 ${SUBTYPES.length}`);
  console.log(`전용 속성  : 신규 ${attrCreated}`);
  console.log(
    "\n⚠️ 제품군 전용 매칭 키는 만들지 않았다 — 캠핑은 카테고리 기본(brand+model)을 쓴다 (D-195·D-208)",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
