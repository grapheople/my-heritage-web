import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  describeDatabase,
  migrationDatabaseUrl,
  pgSslConfig,
  stripSslMode,
} from "../src/lib/db-url";

/**
 * **운동 카테고리 셋업** (D-166) — 실내 무산소(웨이트 트레이닝) 중심.
 *
 * ## 속성 구성의 근거
 * 분류 4종(`targetMuscle`·`equipmentType`·`mechanic`·`forceType`)과 그 옵션 값은
 * **`free-exercise-db` 의 공개 스키마**(800여 종목, force / mechanic / equipment /
 * primaryMuscles enum)를 기준으로 골랐다 — 임의로 만든 분류가 아니다.
 * 실내 무산소와 무관한 값(유산소·스트레칭·플라이오메트릭, medicine/exercise ball,
 * 목·내전근)은 제외했다.
 *
 * 루틴 4종(`sets`·`repsPerSet`·`restSeconds`·`workingWeight`)과 강도 2종
 * (`rpe`·`tempo`)은 근력 훈련 기록의 표준 항목이다. `machineSetting` 은 시중
 * 기록 앱들이 "세트 메모"로 처리하는 것을 **항목으로 승격**한 것이다 — 시트
 * 높이·핀 번호·그립 너비는 종목마다 **고정된 값**이라 매번 적을 것이 아니다.
 *
 * ## ⚠️ `repsPerSet` 은 `number` 가 아니라 `text` 다
 * 실무 표기가 **범위**다("8-12", "AMRAP"). `number` 로 두면 그 표기를 못 쓴다.
 *
 * ## ⚠️ `brand` 를 붙이지 않는다
 * 운동 종목에는 브랜드가 없다. 브랜드 마스터는 카테고리별이므로(D-044) 붙여도
 * 목록이 비어 등록을 막는 칸이 된다. `Item.brandId` 는 optional 이라 문제없다.
 *
 * ## ⚠️ `model` 을 종목명으로 쓴다 — 라벨이 "모델명"으로 뜬다
 * 아이템 명칭은 `Item.model` 컬럼에서 파생되고(D-073), 그 컬럼을 채우는 것은
 * `model` 속성뿐이다. 다른 키를 쓰면 **이름 없는 아이템**이 된다(D-118 이 막은 것).
 * 그런데 라벨은 `AttributeDefinition` 에 있어 **키 단위 전역**이라 카테고리마다
 * 다른 용어를 쓸 수 없다 → OI-83.
 *
 * 멱등이다. 여러 번 실행해도 결과가 같다.
 *
 * ```
 * pnpm attrs:workout
 * ```
 */
const CATEGORY = { key: "workout", displayOrder: 6 };

type Def = {
  key: string;
  type: "text" | "number" | "select" | "multiselect";
  ko: string;
  ja: string;
  en: string;
  unit?: [string, string, string];
  options?: [string, string, string, string][];
};

/** 근육군 — `free-exercise-db` 의 primaryMuscles 에서 실내 무산소 관련만 */
const MUSCLES: [string, string, string, string][] = [
  ["chest", "가슴", "胸", "Chest"],
  ["lats", "광배", "広背筋", "Lats"],
  ["middleBack", "등 중앙", "背中中部", "Middle back"],
  ["lowerBack", "허리", "腰", "Lower back"],
  ["shoulders", "어깨", "肩", "Shoulders"],
  ["traps", "승모근", "僧帽筋", "Traps"],
  ["biceps", "이두", "上腕二頭筋", "Biceps"],
  ["triceps", "삼두", "上腕三頭筋", "Triceps"],
  ["forearms", "전완", "前腕", "Forearms"],
  ["abdominals", "복부", "腹部", "Abdominals"],
  ["glutes", "둔근", "臀筋", "Glutes"],
  ["quadriceps", "대퇴사두", "大腿四頭筋", "Quadriceps"],
  ["hamstrings", "햄스트링", "ハムストリング", "Hamstrings"],
  ["calves", "종아리", "ふくらはぎ", "Calves"],
];

const DEFS: Def[] = [
  /* ── 분류: 종목 자체의 성격. 사람이 바꿀 값이 아니다 ── */
  {
    key: "targetMuscle",
    type: "multiselect",
    ko: "타겟 근육",
    ja: "ターゲット筋群",
    en: "Target muscles",
    options: MUSCLES,
  },
  {
    key: "equipmentType",
    type: "select",
    ko: "사용 기구",
    ja: "使用器具",
    en: "Equipment",
    options: [
      ["barbell", "바벨", "バーベル", "Barbell"],
      ["dumbbell", "덤벨", "ダンベル", "Dumbbell"],
      ["machine", "머신", "マシン", "Machine"],
      ["cable", "케이블", "ケーブル", "Cable"],
      ["kettlebell", "케틀벨", "ケトルベル", "Kettlebell"],
      ["bands", "밴드", "バンド", "Bands"],
      ["bodyOnly", "맨몸", "自重", "Body only"],
      ["ezBar", "EZ바", "EZバー", "E-Z curl bar"],
      ["other", "기타", "その他", "Other"],
    ],
  },
  {
    key: "mechanic",
    type: "select",
    ko: "동작 유형",
    ja: "動作タイプ",
    en: "Mechanic",
    options: [
      ["compound", "복합 관절", "多関節", "Compound"],
      ["isolation", "단일 관절", "単関節", "Isolation"],
    ],
  },
  {
    key: "forceType",
    type: "select",
    ko: "힘 방향",
    ja: "力の方向",
    en: "Force",
    options: [
      ["push", "밀기", "プッシュ", "Push"],
      ["pull", "당기기", "プル", "Pull"],
      ["static", "정적", "静的", "Static"],
    ],
  },

  /* ── 루틴: PM 이 요청한 항목. **목표/현재 설정**이고 세션 기록이 아니다 ── */
  {
    key: "sets",
    type: "number",
    ko: "세트 수",
    ja: "セット数",
    en: "Sets",
    unit: ["세트", "セット", "sets"],
  },
  {
    // 범위 표기("8-12")를 쓰므로 text 다 — 위 주석 참조
    key: "repsPerSet",
    type: "text",
    ko: "세트당 횟수",
    ja: "1セットの回数",
    en: "Reps per set",
  },
  {
    key: "restSeconds",
    type: "number",
    ko: "세트 사이 휴식",
    ja: "セット間の休憩",
    en: "Rest between sets",
    unit: ["초", "秒", "sec"],
  },
  {
    key: "workingWeight",
    type: "number",
    ko: "사용 중량",
    ja: "使用重量",
    en: "Working weight",
    // ⚠️ kg 고정이다. 단위를 유저가 고르게 하면 같은 종목의 값이 섞인다
    unit: ["kg", "kg", "kg"],
  },

  /* ── 강도: 중량만으로는 자극 크기를 알 수 없다 ── */
  {
    key: "rpe",
    type: "number",
    ko: "RPE",
    ja: "RPE",
    en: "RPE",
  },
  {
    // "3-1-1-0" 4구간 표기가 표준이다
    key: "tempo",
    type: "text",
    ko: "템포",
    ja: "テンポ",
    en: "Tempo",
  },

  /* ── 세팅: 종목마다 고정. 기록 앱들이 메모로 처리하던 것 ── */
  {
    key: "machineSetting",
    type: "text",
    ko: "기구 세팅",
    ja: "器具セッティング",
    en: "Machine setting",
  },
];

/** 표시 순서 — 종목명 → 분류 → 루틴 → 강도 → 세팅 → 링크·설명 */
const COMBO: { key: string; required?: boolean }[] = [
  { key: "model", required: true },
  { key: "targetMuscle" },
  { key: "equipmentType" },
  { key: "mechanic" },
  { key: "forceType" },
  { key: "sets" },
  { key: "repsPerSet" },
  { key: "restSeconds" },
  { key: "workingWeight" },
  { key: "rpe" },
  { key: "tempo" },
  { key: "machineSetting" },
  { key: "referenceUrl" },
  { key: "note" },
];

/**
 * 매칭 키 = **종목명 하나**.
 *
 * 도감이 "같은 종목을 하는 사람"이 된다. 표기가 갈려도(`벤치프레스` /
 * `벤치 프레스` / `Bench Press`) 정규화가 공백·대소문자를 흡수하고(D-014),
 * 남는 차이는 alias 로 묶는다(D-009).
 */
const MATCHING_KEY = ["model"];

async function main() {
  const url = migrationDatabaseUrl();
  // ⚠️ 비밀번호를 출력하지 않는다 (D-116)
  console.log(`대상 DB — ${describeDatabase(url)}`);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: stripSslMode(url),
      ssl: pgSslConfig(url),
    }),
  });

  /* ── 1. 카테고리 ── */
  const category = await prisma.category.upsert({
    where: { key: CATEGORY.key },
    update: { displayOrder: CATEGORY.displayOrder, active: true },
    create: { key: CATEGORY.key, displayOrder: CATEGORY.displayOrder, active: true },
    select: { id: true },
  });
  console.log(`카테고리 \`${CATEGORY.key}\` 준비`);

  /* ── 2. 속성 정의 + 옵션 ── */
  for (const d of DEFS) {
    const def = await prisma.attributeDefinition.upsert({
      where: { key: d.key },
      update: {
        type: d.type,
        labelKo: d.ko,
        labelJa: d.ja,
        labelEn: d.en,
        unitKo: d.unit?.[0] ?? null,
        unitJa: d.unit?.[1] ?? null,
        unitEn: d.unit?.[2] ?? null,
      },
      create: {
        key: d.key,
        type: d.type,
        labelKo: d.ko,
        labelJa: d.ja,
        labelEn: d.en,
        unitKo: d.unit?.[0] ?? null,
        unitJa: d.unit?.[1] ?? null,
        unitEn: d.unit?.[2] ?? null,
        // 카테고리 전용 속성이다 — 서비스 공통 사전 번역 대상이 아니다
        isCommon: false,
      },
      select: { id: true },
    });

    for (const [i, [key, ko, ja, en]] of (d.options ?? []).entries()) {
      // ⚠️ 옵션도 3개 언어 전부다 (D-010, policies/i18n §3 — 가장 흔한 누락 지점)
      await prisma.attributeOption.upsert({
        where: {
          attributeDefinitionId_key: { attributeDefinitionId: def.id, key },
        },
        update: { labelKo: ko, labelJa: ja, labelEn: en, active: true, displayOrder: i },
        create: {
          attributeDefinitionId: def.id,
          key,
          labelKo: ko,
          labelJa: ja,
          labelEn: en,
          displayOrder: i,
        },
      });
    }
    console.log(`  속성 \`${d.key}\` (${d.type}) 옵션 ${d.options?.length ?? 0}개`);
  }

  /* ── 3. 조합 (A-02) ── */
  for (const [i, c] of COMBO.entries()) {
    const def = await prisma.attributeDefinition.findUnique({
      where: { key: c.key },
      select: { id: true },
    });
    if (!def) throw new Error(`속성 정의 \`${c.key}\` 가 없습니다 (seed 를 먼저 실행)`);
    await prisma.categoryAttribute.upsert({
      where: {
        categoryId_attributeDefinitionId: {
          categoryId: category.id,
          attributeDefinitionId: def.id,
        },
      },
      update: { required: c.required ?? false, active: true, displayOrder: i },
      create: {
        categoryId: category.id,
        attributeDefinitionId: def.id,
        required: c.required ?? false,
        displayOrder: i,
      },
    });
  }
  console.log(`조합 ${COMBO.length}개 행 준비`);

  /* ── 4. 매칭 키 (A-03) ── */
  await prisma.matchingKeyDefinition.upsert({
    where: { categoryId: category.id },
    update: { attributeKeys: MATCHING_KEY },
    create: { categoryId: category.id, attributeKeys: MATCHING_KEY },
  });
  console.log(`매칭 키 [${MATCHING_KEY.join(" + ")}]`);

  /* ── 확인 ── */
  const check = await prisma.categoryAttribute.findMany({
    where: { categoryId: category.id, active: true },
    orderBy: { displayOrder: "asc" },
    select: {
      required: true,
      attributeDefinition: { select: { key: true, type: true, labelKo: true } },
    },
  });
  console.log(`\n✅ 활성 속성 ${check.length}개`);
  for (const a of check) {
    const d = a.attributeDefinition;
    console.log(`  ${d.key.padEnd(15)} ${d.type.padEnd(12)} ${d.labelKo}${a.required ? " *" : ""}`);
  }
}

main();
