import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * 자극부위 해석 — **저장하지 않고 계산한다** (`FR-10-D-01·02`).
 *
 * ## ⚠️ D-227 로 출처가 바뀌었다 — 유저 속성값이 아니라 **마스터**다
 * 전에는 종목이 아이템이라 `ItemAttributeValue`(유저가 입력한 `targetMuscle`)를
 * 읽었다. 지금은 운동이 **어드민 마스터**이므로 `Exercise.targetMuscles` 를
 * 읽는다. 같은 사실(벤치프레스는 가슴·삼두·어깨)을 유저마다 다시 입력하지
 * 않으니 **사람마다 다르게 칠해지는 일이 없어진다.**
 *
 * ## ⚠️ 왜 컬럼을 만들지 않는가
 * 저장하면 갱신할 자리가 넷이다: 운동 추가 · 제거 · 순서 변경 · **마스터의
 * `targetMuscles` 수정**. 마지막 것은 그 운동을 담은 **모든 루틴**을 따라가야
 * 하는데, 그 경로를 빠뜨리면 **배지가 조용히 거짓말한다** — 화면은 멀쩡하고
 * 값만 틀리다. 계산하면 언제나 최신이다 (D-073 정신).
 *
 * ## ⚠️ 표시 순서는 `AttributeOption.displayOrder` 다 (`FR-10-D-03`)
 * 합집합을 만든 순서로 내면 같은 루틴이 **새로고침마다 다르게** 보인다.
 * 순서의 SoT 를 마스터 테이블로 옮기지 않은 이유가 이것이다 — 3개 언어 라벨과
 * 근육맵 순서가 이미 `AttributeOption` 에 있다 (D-227).
 */

/** 자극부위 속성의 key — 선택지 순서를 읽을 때의 기준 */
const TARGET_MUSCLE = "targetMuscle";

/**
 * 자극부위 표시 순서. `key → displayOrder`.
 *
 * ⚠️ **화면마다 한 번만 부른다.** 아이템마다 부르면 진열 한 화면에 쿼리가
 * 수십 개 붙는다 — 목록 조회는 이 맵을 만들어 각 행에 넘긴다.
 */
export async function muscleOrder(): Promise<Map<string, number>> {
  const rows = await prisma.attributeOption.findMany({
    where: { attributeDefinition: { key: TARGET_MUSCLE } },
    select: { key: true, displayOrder: true },
  });
  return new Map(rows.map((r) => [r.key, r.displayOrder]));
}

/**
 * 자극부위 키들을 표시 순서로 정렬한다 (중복 제거 포함).
 *
 * ⚠️ **순서를 모르는 키는 뒤로 보내되 이름순으로 안정 정렬한다.** 마스터에
 * 선택지 밖의 값이 들어와 있어도(있으면 시드 사고다) 순서가 흔들리지 않는다.
 */
export function sortMuscleKeys(keys: readonly string[], order: Map<string, number>): string[] {
  return [...new Set(keys)].sort((a, b) => {
    const oa = order.get(a) ?? Number.MAX_SAFE_INTEGER;
    const ob = order.get(b) ?? Number.MAX_SAFE_INTEGER;
    return oa !== ob ? oa - ob : a.localeCompare(b);
  });
}

/** 루틴 조회에 펼쳐 쓰는 최소 `select` — 담긴 운동의 자극부위만 읽는다 */
export const ROUTINE_MUSCLE_SELECT = {
  routineItems: {
    orderBy: { displayOrder: "asc" },
    select: { exercise: { select: { targetMuscles: true } } },
  },
} satisfies Prisma.ItemSelect;

/** 이 함수가 요구하는 최소 모양 — 어느 쿼리의 결과든 그대로 넣을 수 있다 */
type RoutineMuscleRow = { exercise: { targetMuscles: string[] } };

/**
 * 루틴의 자극부위 = 담긴 운동 `targetMuscles` 의 **합집합** (`FR-10-D-01`).
 *
 * ⚠️ 루틴 자신의 속성값은 보지 않는다 — 루틴에는 `targetMuscle` 속성이 없다.
 * 있다면 시드가 잘못된 것이다.
 *
 * ⚠️ **빈 배열이면 빈 실루엣**이다 (E-10-06). 담긴 운동이 0개인 루틴은 만든
 * 직후 반드시 거치는 정상 상태다 (E-10-01).
 */
export function musclesOfRoutine(
  rows: readonly RoutineMuscleRow[],
  order: Map<string, number>,
): string[] {
  return sortMuscleKeys(
    rows.flatMap((r) => r.exercise.targetMuscles),
    order,
  );
}

/**
 * 운동 하나의 자극부위 (도감 상세·검색 결과에 쓴다).
 *
 * 마스터 값이라 **합집합이 필요 없다** — 정렬만 한다. 그래서 루틴과 운동이
 * 같은 근육맵 컴포넌트를 쓸 수 있다 (D-224 가 만든 성질을 유지한다).
 */
export function musclesOfExercise(
  exercise: { targetMuscles: string[] },
  order: Map<string, number>,
): string[] {
  return sortMuscleKeys(exercise.targetMuscles, order);
}
