import "./env";
import { addRoutineEntryAs } from "../src/lib/actions/item";
import { prisma } from "../src/lib/prisma";
import { describeDatabase, runtimeDatabaseUrl } from "../src/lib/db-url";
import type { Viewer } from "../src/lib/auth/viewer";

/**
 * 봇 방에 **새 구조의 루틴 1개**를 만든다 (D-230 · D-234 후속).
 *
 * ## ⚠️ 왜 필요한가
 * D-230 정리로 봇 방의 운동 6칸이 비었다. 그 방은 서비스를 처음 보는 사람이
 * 훑는 진열이므로 **운동 카테고리가 빈 채로 남으면 카테고리가 죽어 보인다.**
 * D-230 본문이 "필요하면 루틴 1개 + 운동 6개로 다시 만든다 — 그것이 새 구조의
 * 시연이기도 하다"고 적어둔 그대로다.
 *
 * ## ⚠️ 아이템은 직접 만들고, 운동은 **액션으로** 담는다
 * `createItemAs` 는 경험치·필수 속성 검증을 함께 도는 유저 경로다. 봇 시딩에
 * 그것을 쓰면 봇에게 exp 가 붙는다. 대신 **운동을 담는 것은 `attachExerciseAs`**
 * 를 쓴다 — 비활성 차단·중복 차단·순서 부여·설정 파싱이 유저와 **같은 규칙**을
 * 거쳐야 시연이 거짓말하지 않는다.
 *
 * ## ⚠️ 멱등하다
 * 같은 이름의 루틴이 이미 있으면 아무것도 하지 않는다. 두 번 돌려 루틴이 두 개가
 * 되면 그 방 진열이 이상해진다.
 *
 *   pnpm db:seed-bot-routine
 */

const ROUTINE_NAME = "가슴·삼두 / 등·이두 분할 A";
/** 수행 요일 — 월·목 */
const DAYS = ["mon", "thu"];

/** 담을 운동과 **내 설정** — 실제로 쓰는 값처럼 채운다 (빈 설정은 시연이 안 된다) */
type PlanStep =
  | {
      kind: "EXERCISE";
      name: string;
      /** **세트별** 횟수 (D-236) — 피라미드를 그대로 넣는다 */
      reps: string[];
      /** 세트 사이 휴식 (초) */
      rest: string;
      weight?: string;
      rpe?: string;
    }
  | { kind: "REST"; minutes: string };

/**
 * ⚠️ **휴식 항목을 섞는다** (D-236). 새 구조의 시연이므로 **운동 사이 휴식**이
 * 실제로 보여야 한다 — 운동만 나열하면 그 기능이 있는지 알 수 없다.
 */
const PLAN: PlanStep[] = [
  { kind: "EXERCISE", name: "바벨 벤치프레스", reps: ["8", "6", "6"], rest: "180", weight: "80", rpe: "8" },
  { kind: "EXERCISE", name: "시티드 덤벨 숄더 프레스", reps: ["12", "10", "10"], rest: "120", weight: "20" },
  { kind: "EXERCISE", name: "케이블 로프 트라이셉 푸시다운", reps: ["15", "12", "12"], rest: "90", weight: "25" },
  // 상체 → 하체로 넘어가는 자리. 3분 쉰다
  { kind: "REST", minutes: "3" },
  { kind: "EXERCISE", name: "랫풀다운 (와이드 그립)", reps: ["10", "10", "8"], rest: "120", weight: "55" },
  { kind: "EXERCISE", name: "바벨 하이바 백스쿼트", reps: ["5", "5", "5"], rest: "240", weight: "100", rpe: "8.5" },
  { kind: "EXERCISE", name: "컨벤셔널 데드리프트", reps: ["5", "5"], rest: "240", weight: "120", rpe: "8.5" },
];

async function main() {
  console.log(`대상 DB — ${describeDatabase(runtimeDatabaseUrl())}`);

  const category = await prisma.category.findUnique({
    where: { key: "workout" },
    select: { id: true, userCodexCreation: true },
  });
  if (!category) throw new Error("운동 카테고리가 없습니다");
  /*
    ⚠️ **개편이 적용되지 않은 DB 에서는 돌리지 않는다.** 옛 구조에서 루틴을 만들면
    매칭 키가 살아 있어 **루틴명으로 도감이 생긴다** (D-227 이 없앤 문제)
  */
  if (category.userCodexCreation) {
    throw new Error("개편이 적용되지 않았습니다 — `pnpm attrs:workout-master` 를 먼저 실행하세요");
  }

  const bot = await prisma.botAccount.findFirst({
    where: { user: { deletedAt: null, room: { isNot: null } } },
    select: { user: { select: { id: true, room: { select: { id: true, name: true } } } } },
  });
  const room = bot?.user.room;
  if (!room) throw new Error("방을 가진 봇 계정이 없습니다");
  console.log(`봇 방 — ${room.name}`);

  const existing = await prisma.item.findFirst({
    where: { roomId: room.id, categoryId: category.id },
    select: { id: true, model: true },
  });
  if (existing) {
    console.log(`이미 운동 아이템이 있습니다 — "${existing.model}" (아무것도 하지 않음)`);
    return;
  }

  // 루틴명(`model`)과 수행 요일 속성 링크
  const attrs = await prisma.categoryAttribute.findMany({
    where: { categoryId: category.id, active: true },
    select: { id: true, attributeDefinition: { select: { key: true } } },
  });
  const linkOf = (key: string) => attrs.find((a) => a.attributeDefinition.key === key)?.id;
  const modelLink = linkOf("model");
  if (!modelLink) throw new Error("`model` 속성이 연결돼 있지 않습니다");
  const daysLink = linkOf("workoutDays");

  const routine = await prisma.item.create({
    data: {
      roomId: room.id,
      categoryId: category.id,
      // 명칭은 `Item.model` 파생이다 (D-073·D-118) — 속성값과 컬럼 둘 다 채운다
      model: ROUTINE_NAME,
      visibility: "PUBLIC",
      attributeValues: {
        create: [
          { categoryAttributeId: modelLink, value: ROUTINE_NAME },
          ...(daysLink ? [{ categoryAttributeId: daysLink, value: DAYS }] : []),
        ],
      },
    },
    select: { id: true },
  });
  console.log(`루틴 생성 — "${ROUTINE_NAME}"`);

  const viewer = { userId: bot.user.id, roomId: room.id } as Viewer;
  let added = 0;
  for (const p of PLAN) {
    if (p.kind === "REST") {
      // ⚠️ **유저와 같은 액션을 쓴다** — 규칙이 갈리면 시연이 거짓말한다
      const res = await addRoutineEntryAs(viewer, {
        routineId: routine.id,
        entry: { kind: "REST", minutes: p.minutes, seconds: "0" },
      });
      if (res.ok) {
        added++;
        console.log(`  + ⏸ 휴식 ${p.minutes}분`);
      } else {
        console.log(`  ! 휴식 — ${res.formError ?? "실패"}`);
      }
      continue;
    }

    const ex = await prisma.exercise.findFirst({
      where: { codexItem: { displayName: p.name } },
      select: { id: true },
    });
    if (!ex) {
      console.log(`  ! ${p.name} — 마스터에 없습니다 (건너뜀)`);
      continue;
    }
    const res = await addRoutineEntryAs(viewer, {
      routineId: routine.id,
      entry: {
        kind: "EXERCISE",
        exerciseId: ex.id,
        reps: p.reps,
        restSeconds: p.rest,
        weight: p.weight,
        rpe: p.rpe,
      },
    });
    if (res.ok) {
      added++;
      console.log(
        `  + ${p.name} — ${p.reps.length}세트 ${p.reps.join("-")}${p.weight ? ` ${p.weight}kg` : ""}`,
      );
    } else {
      console.log(`  ! ${p.name} — ${res.formError ?? "실패"}`);
    }
  }

  console.log(`\n완료 — 루틴 1개 · 담긴 항목 ${added}건. 방 진열에는 **루틴 1칸**만 보인다 (전시 단위는 루틴이다).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
