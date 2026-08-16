import "./env";
import { MUSCLE_KEYS } from "../src/components/domain/muscle-map";
import { prisma } from "../src/lib/prisma";
import { describeDatabase, runtimeDatabaseUrl } from "../src/lib/db-url";

/**
 * 운동 **루틴 제품군** 시드 (D-221·D-222·D-224).
 *
 * ## 무엇을 만드는가
 * | 대상 | 값 |
 * |---|---|
 * | `CategorySubtype(workout/routine)` | 루틴 |
 * | 전용 속성 | `workoutDays`(수행 요일, multiselect 7) |
 * | **매칭 키** | **빈 배열** — 도감을 만들지 않는다 |
 * | `Category(workout).requiresPhoto` | **`false`** |
 *
 * ## ⚠️ 빈 매칭 키가 이 시드의 핵심이다 (FR-10-A-02·03)
 * 운동의 매칭 키는 `[model]` 하나라(D-166) **그냥 두면 루틴명마다 도감이
 * 생긴다.** 제품군 매칭 키를 비우면 `resolveMatchingKeyOrder` 가 `[]` 를
 * 돌려주고 `buildMatchingKey` 가 `null` 을 반환해 **등록 경로의 `if (key)` 가
 * 통째로 건너뛴다** — 도감 조회도 자동 생성도 일어나지 않는다.
 *
 * 코드를 고치지 않고 **데이터로 끈다.** D-173 이 `sellable` 플래그를 고른 것과
 * 같은 태도다 — "플래그면 데이터가 규칙을 들고 있다".
 *
 * ## ⚠️ `note` 를 새로 만들지 않는다
 * 메모는 **공통 속성**이 이미 있다(D-166 이 운동에 붙여둔 `note`). 새로 만들면
 * 번역이 두 벌이 되고 한쪽만 고쳐진다 (D-010).
 *
 * ## ⚠️ `model` 라벨을 제품군 override 로 "루틴명"으로 바꾼다
 * 아이템 명칭이 `Item.model` 파생이라(D-073·D-118) 다른 키를 쓰면 **이름 없는
 * 아이템**이 된다. 라벨만 바꾼다 — D-168 이 만든 기제 그대로다.
 *
 * ## ⚠️ `targetMuscle` 옵션과 근육맵 키를 **대조한다**
 * 어긋나도 그림이 **조용히 안 칠해질 뿐**이라 알아채기 어렵다 (D-223).
 * 그래서 여기서 세고, 다르면 던진다.
 *
 * 멱등하다.
 *
 *   pnpm attrs:workout-routine
 */

const SUBTYPE = { key: "routine", ko: "루틴", ja: "ルーティン", en: "Routine" };

/** 수행 요일 — 월요일 시작 (ko/ja/en 공통 관행) */
const DAYS: [string, string, string, string][] = [
  ["mon", "월", "月", "Mon"],
  ["tue", "화", "火", "Tue"],
  ["wed", "수", "水", "Wed"],
  ["thu", "목", "木", "Thu"],
  ["fri", "금", "金", "Fri"],
  ["sat", "토", "土", "Sat"],
  ["sun", "일", "日", "Sun"],
];

async function main() {
  console.log(`대상 DB — ${describeDatabase(runtimeDatabaseUrl())}`);

  const category = await prisma.category.findUnique({
    where: { key: "workout" },
    select: { id: true, requiresPhoto: true },
  });
  if (!category) throw new Error("운동 카테고리가 없습니다 — `pnpm attrs:workout` 을 먼저 실행하세요");

  /*
    ⚠️ **근육맵 키와 `targetMuscle` 옵션이 1:1 인지 먼저 본다** (D-223).
    어긋나면 루틴 카드가 조용히 덜 칠해진다 — 화면만 보고는 못 잡는다.
  */
  const def = await prisma.attributeDefinition.findUnique({
    where: { key: "targetMuscle" },
    select: { id: true, options: { select: { key: true } } },
  });
  if (!def) throw new Error("`targetMuscle` 속성이 없습니다 — `pnpm attrs:workout` 을 먼저 실행하세요");
  const optionKeys = new Set(def.options.map((o) => o.key));
  const missing = MUSCLE_KEYS.filter((k) => !optionKeys.has(k));
  const extra = [...optionKeys].filter((k) => !(MUSCLE_KEYS as readonly string[]).includes(k));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `근육맵과 targetMuscle 옵션이 어긋납니다 — 그림에만 있음: [${missing.join(", ")}] · 옵션에만 있음: [${extra.join(", ")}]`,
    );
  }
  console.log(`근육맵 ↔ targetMuscle 옵션 ${optionKeys.size}개 일치 ✅`);

  // ── 1. 사진 필수 해제 (D-224) ─────────────────────────────
  if (category.requiresPhoto) {
    await prisma.category.update({
      where: { id: category.id },
      data: { requiresPhoto: false },
    });
    console.log("사진 필수 해제 — workout.requiresPhoto = false (D-224)");
  } else {
    console.log("사진 필수 이미 해제됨");
  }

  // ── 2. 제품군 ────────────────────────────────────────────
  let subtype = await prisma.categorySubtype.findUnique({
    where: { categoryId_key: { categoryId: category.id, key: SUBTYPE.key } },
    select: { id: true },
  });
  if (!subtype) {
    subtype = await prisma.categorySubtype.create({
      data: {
        categoryId: category.id,
        key: SUBTYPE.key,
        labelKo: SUBTYPE.ko, labelJa: SUBTYPE.ja, labelEn: SUBTYPE.en,
        displayOrder: 0,
      },
      select: { id: true },
    });
    console.log(`제품군 '${SUBTYPE.key}' 생성`);
  } else {
    console.log(`제품군 '${SUBTYPE.key}' 이미 있음`);
  }

  // ── 3. ⚠️ 빈 매칭 키 — 도감을 만들지 않는다 ─────────────────
  const key = await prisma.matchingKeyDefinition.findUnique({
    where: { subtypeId: subtype.id },
    select: { id: true, attributeKeys: true },
  });
  if (!key) {
    await prisma.matchingKeyDefinition.create({
      data: { subtypeId: subtype.id, attributeKeys: [] },
    });
    console.log("매칭 키 = [] 생성 — 루틴은 도감을 갖지 않는다 (FR-10-A-02·03)");
  } else if (key.attributeKeys.length > 0) {
    await prisma.matchingKeyDefinition.update({
      where: { id: key.id },
      data: { attributeKeys: [] },
    });
    console.log(`매칭 키를 [${key.attributeKeys.join("+")}] → [] 로 비웠다`);
  } else {
    console.log("매칭 키 이미 비어 있음");
  }

  // ── 4. 수행 요일 속성 ─────────────────────────────────────
  let days = await prisma.attributeDefinition.findUnique({
    where: { key: "workoutDays" },
    select: { id: true },
  });
  if (!days) {
    days = await prisma.attributeDefinition.create({
      data: {
        key: "workoutDays",
        type: "multiselect",
        labelKo: "수행 요일", labelJa: "実施曜日", labelEn: "Days",
        isCommon: false,
        options: {
          create: DAYS.map(([k, ko, ja, en], i) => ({
            key: k, labelKo: ko, labelJa: ja, labelEn: en, displayOrder: i,
          })),
        },
      },
      select: { id: true },
    });
    console.log("속성 `workoutDays` 생성 (요일 7개)");
  } else {
    console.log("속성 `workoutDays` 이미 있음");
  }

  // ── 5. 제품군 전용 속성 연결 ───────────────────────────────
  const has = await prisma.categoryAttribute.findUnique({
    where: {
      subtypeId_attributeDefinitionId: { subtypeId: subtype.id, attributeDefinitionId: days.id },
    },
    select: { id: true },
  });
  if (!has) {
    // 요일을 모를 수 있다. 필수로 걸면 등록이 막힌다 (원칙 3)
    await prisma.categoryAttribute.create({
      data: { subtypeId: subtype.id, attributeDefinitionId: days.id, required: false, displayOrder: 0 },
    });
    console.log("제품군 전용 속성 연결 — 수행 요일");
  } else {
    console.log("제품군 전용 속성 이미 연결됨");
  }

  // ── 6. `model` 라벨 override — "루틴명" (D-168 기제) ────────
  const modelDef = await prisma.attributeDefinition.findUnique({
    where: { key: "model" },
    select: { id: true },
  });
  if (modelDef) {
    const link = await prisma.categoryAttribute.findUnique({
      where: {
        subtypeId_attributeDefinitionId: { subtypeId: subtype.id, attributeDefinitionId: modelDef.id },
      },
      select: { id: true },
    });
    /*
      ⚠️ `model` 은 **카테고리 공통**이라 이미 폼에 나온다. 제품군에 또 붙이면
      **두 번 그려진다** — 라벨만 바꾸려고 행을 만들면 안 된다.
      제품군 override 는 카테고리 공통 행에 걸 수 없으므로, 라벨은 화면에서
      제품군을 보고 고른다. 여기서는 **중복 연결이 없는지 확인만** 한다.
    */
    if (link) {
      console.log("⚠️ `model` 이 제품군에도 연결돼 있다 — 폼에 두 번 나온다. 확인 필요");
    }
  }

  console.log(
    "\n⚠️ 루틴은 **제품군 매칭 키가 비어 있어** 도감을 만들지 않는다 (FR-10-A-03)",
  );
  console.log("⚠️ 운동은 **사진 없이 등록**된다. 대표 이미지는 근육맵이다 (D-222·D-224)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
