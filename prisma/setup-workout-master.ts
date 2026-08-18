import "./env";
import { MUSCLE_KEYS } from "../src/components/domain/muscle-map";
import { insertExercise, promoteCodexToExercise } from "../src/lib/exercise-insert";
import { prisma } from "../src/lib/prisma";
import { describeDatabase, runtimeDatabaseUrl } from "../src/lib/db-url";

/**
 * 운동 카테고리 **전면 개편** 시드 (D-227~D-232).
 *
 * ## 무엇을 바꾸는가
 * | 대상 | 값 | 근거 |
 * |---|---|---|
 * | `Category(workout).userCodexCreation` | **`false`** | D-231 — 유저 등록이 도감을 만들지 않는다 |
 * | `Category(workout).requiresPhoto` | **`false`** | D-224 |
 * | 카테고리 **매칭 키** | **빈 배열** | `FR-10-A-02` |
 * | 제품군 `routine` | **삭제** | `FR-10-A-08` — 아이템이 루틴뿐이면 축이 필요 없다 |
 * | 운동 분류 속성 12종 | **비활성** | 마스터·관계 컬럼으로 이관됨 (D-227) |
 * | `model` 라벨 override | **"루틴명"** | D-168 정정 — 그 칸에 들어가는 것이 루틴명이다 |
 * | `Exercise` 시드 | 6건 | D-230 — 봇 종목의 분류 값을 재활용 |
 *
 * ## ⚠️ 이 스크립트는 데이터만 바꾼다 — 삭제는 하지 않는다
 * 운영의 옛 운동 아이템 7건 정리는 **별도 스크립트**다
 * (`pnpm db:cleanup-workout`, D-230). 시드에 삭제를 섞으면 실수로 돌렸을 때
 * 되돌릴 수 없다.
 *
 * ## ⚠️ 속성을 **지우지 않고 비활성화**한다 (D-036)
 * `sets`·`workingWeight` 등은 `AttributeDefinition` 공통 라이브러리 항목이고
 * **라벨·단위 3개 언어가 거기 있다.** 루틴 편집 폼이 그 라벨을 읽으므로
 * (`getRoutineFieldLabels`) 지우면 폼이 키 이름으로 뜬다. 카테고리 연결만 끊는다.
 *
 * ## ⚠️ 근육맵 키와 `targetMuscle` 옵션을 대조한다 (D-223)
 * 어긋나도 그림이 **조용히 안 칠해질 뿐**이라 알아채기 어렵다. 여기서 세고,
 * 다르면 던진다.
 *
 * 멱등하다.
 *
 *   pnpm attrs:workout-master
 */

/** 마스터·관계 컬럼으로 이관돼 카테고리에서 빠지는 속성 (D-227) */
const MOVED_TO_MASTER = ["targetMuscle", "equipmentType", "mechanic", "forceType", "referenceUrl"];
const MOVED_TO_RELATION = [
  "sets",
  "repsPerSet",
  "restSeconds",
  "workingWeight",
  "rpe",
  "tempo",
  "machineSetting",
];

/** 루틴에 남는 속성 — 루틴명(`model`)과 수행 요일·메모 */
const KEEP = ["model", "workoutDays", "note"];

/** 수행 요일 선택지 — 월요일 시작 (ko/ja/en 공통 관행). D-221 의 값 그대로 */
const DAYS: [string, string, string, string][] = [
  ["mon", "월", "月", "Mon"],
  ["tue", "화", "火", "Tue"],
  ["wed", "수", "水", "Wed"],
  ["thu", "목", "木", "Thu"],
  ["fri", "금", "金", "Fri"],
  ["sat", "토", "土", "Sat"],
  ["sun", "일", "日", "Sun"],
];

/**
 * 초기 마스터 시드 (D-230 — 봇 6종목의 분류 값을 그대로 옮긴다).
 *
 * ⚠️ **사람이 이미 확인한 값**이다 (D-166 검증에 쓰였다). AI 수집으로 다시 만들 수
 * 있지만 확인된 6건을 버리는 것은 손해다. 나머지 80~120건은 A-17 에서 수집한다
 * (D-232 · OI-105).
 */
const SEED: {
  name: string;
  muscles: string[];
  equipment: string;
  mechanic: string;
  force: string;
  /**
   * 언어별 표기 (D-009).
   *
   * ⚠️ **없으면 그 언어 유저가 못 찾는다.** 실측으로 확인했다 — alias 없이는
   * `bench` 검색이 **0건**이었다. 브랜드에서 겪은 자리다 (D-047: "alias 가 없으면
   * 브랜드가 없는 것으로 오인된다"). 3개 시장 동시 출시이므로 시드에 함께 넣는다.
   */
  ja: string[];
  en: string[];
}[] = [
  {
    name: "바벨 벤치프레스",
    muscles: ["chest", "triceps", "shoulders"],
    equipment: "barbell",
    mechanic: "compound",
    force: "push",
    ja: ["ベンチプレス", "バーベルベンチプレス"],
    en: ["Bench Press", "Barbell Bench Press"],
  },
  {
    name: "바벨 하이바 백스쿼트",
    muscles: ["quadriceps", "glutes", "hamstrings"],
    equipment: "barbell",
    mechanic: "compound",
    force: "push",
    ja: ["バックスクワット", "ハイバースクワット"],
    en: ["Back Squat", "High Bar Squat"],
  },
  {
    name: "컨벤셔널 데드리프트",
    muscles: ["hamstrings", "glutes", "lowerBack", "traps"],
    equipment: "barbell",
    mechanic: "compound",
    force: "pull",
    ja: ["デッドリフト", "コンベンショナルデッドリフト"],
    en: ["Deadlift", "Conventional Deadlift"],
  },
  {
    name: "랫풀다운 (와이드 그립)",
    muscles: ["lats", "middleBack", "biceps"],
    equipment: "cable",
    mechanic: "compound",
    force: "pull",
    ja: ["ラットプルダウン"],
    en: ["Lat Pulldown", "Wide Grip Lat Pulldown"],
  },
  {
    name: "시티드 덤벨 숄더 프레스",
    muscles: ["shoulders", "triceps"],
    equipment: "dumbbell",
    mechanic: "compound",
    force: "push",
    ja: ["ダンベルショルダープレス"],
    en: ["Dumbbell Shoulder Press", "Seated Dumbbell Press"],
  },
  {
    name: "케이블 로프 트라이셉 푸시다운",
    muscles: ["triceps"],
    equipment: "cable",
    mechanic: "isolation",
    force: "push",
    ja: ["トライセプスプッシュダウン"],
    en: ["Triceps Pushdown", "Cable Rope Pushdown"],
  },
];

async function main() {
  console.log(`대상 DB — ${describeDatabase(runtimeDatabaseUrl())}`);

  const category = await prisma.category.findUnique({
    where: { key: "workout" },
    select: { id: true, requiresPhoto: true, userCodexCreation: true },
  });
  if (!category) {
    throw new Error("운동 카테고리가 없습니다 — `pnpm attrs:workout` 을 먼저 실행하세요");
  }

  /* ── 0. 근육맵 ↔ 선택지 대조 (D-223) ───────────────────── */
  const def = await prisma.attributeDefinition.findUnique({
    where: { key: "targetMuscle" },
    select: { id: true, options: { select: { key: true } } },
  });
  if (!def) {
    throw new Error("`targetMuscle` 속성이 없습니다 — `pnpm attrs:workout` 을 먼저 실행하세요");
  }
  const optionKeys = new Set(def.options.map((o) => o.key));
  const missing = MUSCLE_KEYS.filter((k) => !optionKeys.has(k));
  const extra = [...optionKeys].filter((k) => !(MUSCLE_KEYS as readonly string[]).includes(k));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `근육맵과 targetMuscle 옵션이 어긋납니다 — 그림에만 있음: [${missing.join(", ")}] · 옵션에만 있음: [${extra.join(", ")}]`,
    );
  }
  console.log(`근육맵 ↔ targetMuscle 옵션 ${optionKeys.size}개 일치 ✅`);

  /* ── 1. 카테고리 플래그 2개 (D-231·D-224) ───────────────── */
  if (category.userCodexCreation || category.requiresPhoto) {
    await prisma.category.update({
      where: { id: category.id },
      data: { userCodexCreation: false, requiresPhoto: false },
    });
    console.log("플래그 — userCodexCreation=false (D-231) · requiresPhoto=false (D-224)");
  } else {
    console.log("플래그 이미 적용됨");
  }

  /* ── 2. 카테고리 매칭 키를 비운다 (FR-10-A-02) ──────────── */
  const key = await prisma.matchingKeyDefinition.findUnique({
    where: { categoryId: category.id },
    select: { id: true, attributeKeys: true },
  });
  if (!key) {
    await prisma.matchingKeyDefinition.create({
      data: { categoryId: category.id, attributeKeys: [] },
    });
    console.log("카테고리 매칭 키 = [] 생성");
  } else if (key.attributeKeys.length > 0) {
    await prisma.matchingKeyDefinition.update({
      where: { id: key.id },
      data: { attributeKeys: [] },
    });
    console.log(`카테고리 매칭 키를 [${key.attributeKeys.join("+")}] → [] 로 비웠다`);
  } else {
    console.log("카테고리 매칭 키 이미 비어 있음");
  }

  /* ── 3. 제품군 `routine` 삭제 (FR-10-A-08) ──────────────── */
  const subtype = await prisma.categorySubtype.findUnique({
    where: { categoryId_key: { categoryId: category.id, key: "routine" } },
    select: { id: true, _count: { select: { items: true } } },
  });
  if (subtype) {
    /*
      ⚠️ **아이템이 그 제품군을 가리키고 있으면 먼저 떼어낸다.** `Item.subtypeId`
      가 `SetNull` 이라 지워도 데이터는 남지만, 제품군 전용 속성(`workoutDays`)이
      함께 사라지면 그 값이 폼에 안 나온다 — 카테고리 공통으로 옮긴다
      */
    await prisma.item.updateMany({
      where: { subtypeId: subtype.id },
      data: { subtypeId: null },
    });
    // 제품군 전용 속성을 **카테고리 공통으로 승격**한다 (수행 요일은 계속 쓴다)
    const subtypeAttrs = await prisma.categoryAttribute.findMany({
      where: { subtypeId: subtype.id },
      select: { id: true, attributeDefinitionId: true, required: true, displayOrder: true },
    });
    for (const a of subtypeAttrs) {
      const existing = await prisma.categoryAttribute.findUnique({
        where: {
          categoryId_attributeDefinitionId: {
            categoryId: category.id,
            attributeDefinitionId: a.attributeDefinitionId,
          },
        },
        select: { id: true },
      });
      if (!existing) {
        await prisma.categoryAttribute.create({
          data: {
            categoryId: category.id,
            attributeDefinitionId: a.attributeDefinitionId,
            required: a.required,
            displayOrder: a.displayOrder,
          },
        });
      }
      await prisma.categoryAttribute.delete({ where: { id: a.id } });
    }
    await prisma.categorySubtype.delete({ where: { id: subtype.id } });
    console.log(`제품군 'routine' 삭제 — 전용 속성 ${subtypeAttrs.length}개를 카테고리 공통으로 승격`);
  } else {
    console.log("제품군 'routine' 없음 (이미 정리됨 또는 운영처럼 처음부터 없음)");
  }

  /* ── 3-1. 수행 요일 속성 보장 (FR-10-A-05) ──────────────── */
  /*
    ⚠️ **운영에는 이 속성이 없었다** — 실측으로 드러났다. `workoutDays` 는
    `setup-workout-routine.ts`(D-221)가 **제품군 전용 속성**으로 만들던 것이고,
    운영은 그 시드를 돌린 적이 없다(D-225 의 "원격 미적용"). 제품군을 승격하는
    위 3단계는 **제품군이 있을 때만** 동작하므로 운영에서는 아무것도 승격되지
    않았고, 루틴에 **수행 요일 칸이 아예 없는** 상태가 됐다.

    그래서 이 시드가 **직접 보장한다** — "앞선 시드가 돌았을 것"이라는 전제를
    두지 않는다. 그 전제가 이 갭을 만들었다.
  */
  let days = await prisma.attributeDefinition.findUnique({
    where: { key: "workoutDays" },
    select: { id: true },
  });
  if (!days) {
    days = await prisma.attributeDefinition.create({
      data: {
        key: "workoutDays",
        type: "multiselect",
        labelKo: "수행 요일",
        labelJa: "実施曜日",
        labelEn: "Days",
        isCommon: false,
        options: {
          create: DAYS.map(([k, ko, ja, en], i) => ({
            key: k,
            labelKo: ko,
            labelJa: ja,
            labelEn: en,
            displayOrder: i,
          })),
        },
      },
      select: { id: true },
    });
    console.log("속성 `workoutDays` 생성 (요일 7개)");
  }
  const daysLink = await prisma.categoryAttribute.findUnique({
    where: {
      categoryId_attributeDefinitionId: {
        categoryId: category.id,
        attributeDefinitionId: days.id,
      },
    },
    select: { id: true, active: true },
  });
  if (!daysLink) {
    // 요일을 모를 수 있다. 필수로 걸면 등록이 막힌다 (원칙 3)
    await prisma.categoryAttribute.create({
      data: {
        categoryId: category.id,
        attributeDefinitionId: days.id,
        required: false,
        displayOrder: 1,
      },
    });
    console.log("수행 요일을 카테고리 공통 속성으로 연결");
  } else if (!daysLink.active) {
    await prisma.categoryAttribute.update({ where: { id: daysLink.id }, data: { active: true } });
    console.log("수행 요일 재활성화");
  } else {
    console.log("수행 요일 이미 연결됨");
  }

  /* ── 4. 이관된 속성 12종 비활성화 (D-227·D-036) ──────────── */
  const moved = [...MOVED_TO_MASTER, ...MOVED_TO_RELATION];
  const links = await prisma.categoryAttribute.findMany({
    where: {
      categoryId: category.id,
      attributeDefinition: { key: { in: moved } },
      active: true,
    },
    select: { id: true, attributeDefinition: { select: { key: true } } },
  });
  if (links.length > 0) {
    await prisma.categoryAttribute.updateMany({
      where: { id: { in: links.map((l) => l.id) } },
      data: { active: false },
    });
    console.log(
      `이관 속성 ${links.length}개 비활성화 — ${links.map((l) => l.attributeDefinition.key).join(", ")}`,
    );
  } else {
    console.log("이관 속성 이미 비활성화됨");
  }

  const kept = await prisma.categoryAttribute.findMany({
    where: { categoryId: category.id, active: true },
    select: { attributeDefinition: { select: { key: true } } },
  });
  const keptKeys = kept.map((k) => k.attributeDefinition.key);
  console.log(`루틴에 남은 활성 속성 — ${keptKeys.join(", ") || "(없음)"}`);
  const unexpected = keptKeys.filter((k) => !KEEP.includes(k));
  if (unexpected.length > 0) {
    console.log(`⚠️ 예상 밖 활성 속성: ${unexpected.join(", ")} — 루틴 폼에 나옵니다`);
  }

  /* ── 5. `model` 라벨 override = "루틴명" (D-168 정정) ────── */
  const modelLink = await prisma.categoryAttribute.findFirst({
    where: { categoryId: category.id, attributeDefinition: { key: "model" } },
    select: { id: true, labelKo: true },
  });
  if (modelLink) {
    await prisma.categoryAttribute.update({
      where: { id: modelLink.id },
      data: { labelKo: "루틴명", labelJa: "ルーティン名", labelEn: "Routine name" },
    });
    console.log(`\`model\` 라벨 override — "${modelLink.labelKo ?? "(없음)"}" → "루틴명"`);
  } else {
    console.log("⚠️ `model` 이 운동 카테고리에 연결돼 있지 않습니다 — 루틴명을 입력할 칸이 없습니다");
  }

  /* ── 6. 운동 마스터 시드 (D-230) ─────────────────────────── */
  let created = 0;
  let promoted = 0;
  let skipped = 0;
  const actorId = await seedActorId();
  for (const s of SEED) {
    const fields = {
      targetMuscles: s.muscles,
      equipmentType: s.equipment,
      mechanic: s.mechanic,
      forceType: s.force,
    };
    /*
      ⚠️ **같은 이름의 옛 도감이 있으면 그것을 승격한다** (D-230). 새로 만들고
      옛것을 지우면 도감 id 가 바뀌어 착용샷·일기·알림이 끊긴다 — 개편 전 운동
      아이템이 만든 도감이 실제로 남아 있다
    */
    const promote = await promoteCodexToExercise({
      displayName: s.name,
      fields,
      aliases: { ja: s.ja, en: s.en },
    });
    if (promote.ok) {
      if (promote.already) {
        skipped++;
        console.log(`  = ${s.name} (이미 마스터)`);
      } else {
        promoted++;
        console.log(`  ↑ ${s.name} (옛 도감을 마스터로 승격)`);
      }
      continue;
    }

    const res = await insertExercise({
      displayName: s.name,
      fields,
      aliases: { ja: s.ja, en: s.en },
      /*
        ⚠️ **검증됨으로 넣는다.** 사람이 확인한 값이다 (D-166 검증에 쓰였다) —
        미검증으로 넣으면 A-05 큐에 6건이 쌓이는데 확인할 것이 없다
      */
      verification: "VERIFIED",
      actorId,
    });
    if (res.ok) {
      created++;
      console.log(`  + ${s.name}`);
    } else {
      skipped++;
      console.log(`  ! ${s.name} — ${res.error}`);
    }
  }
  console.log(`운동 마스터 — 신규 ${created}건 · 승격 ${promoted}건 · 건너뜀 ${skipped}건`);

  const total = await prisma.exercise.count();
  console.log(
    `\n완료. 운동 마스터 ${total}건. 목표는 80~120건이다 (D-232) — 나머지는 A-17 에서 AI 수집으로 채운다.`,
  );
}

/**
 * 검증자로 기록할 `AdminUser.id`.
 *
 * ⚠️ **없으면 던진다.** `null` 을 넣으면 "검증됨인데 검증자가 없는" 도감이 생기고,
 * A-05 에서 "누가 검증했는데 왜 미검증인가"의 반대 형태로 읽힌다 (`FR-04-B-03`).
 */
async function seedActorId(): Promise<string> {
  const admin = await prisma.adminUser.findFirst({
    where: { active: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    throw new Error("활성 어드민이 없습니다 — `pnpm tsx prisma/add-admin.ts` 로 먼저 만드세요");
  }
  return admin.id;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
