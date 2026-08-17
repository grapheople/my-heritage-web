import type { Prisma } from "@/generated/prisma/client";

/**
 * 자극부위 해석 — **저장하지 않고 계산한다** (D-221 `FR-10-D-01·02`).
 *
 * ## ⚠️ 왜 컬럼을 만들지 않는가
 * 저장하면 갱신할 자리가 넷이다: 종목 추가 · 제거 · 순서 변경 · **종목 자체의
 * `targetMuscle` 수정**. 마지막 것은 부모를 따라 올라가야 하는데, 그 경로를
 * 빠뜨리면 **배지가 조용히 거짓말한다** — 화면은 멀쩡하고 값만 틀리다.
 *
 * 계산하면 **언제나 최신**이라 "자동 결정·갱신"이라는 요구가 저절로 충족된다.
 * D-166 이 `1RM` 을 "중량·횟수에서 나오는 파생값"이라며 넣지 않은 것과 같다
 * (D-073 정신).
 *
 * ## ⚠️ 판정을 **한 함수**에 둔다
 * 초판은 `MUSCLE_SELECT` 의 모양에 묶인 함수를 만들었다가, 아이템 상세가 이미
 * 갖고 있던 `attributeValues` 선택과 **충돌**했다 — 스프레드가 그것을 덮어써
 * 단위·라벨이 통째로 사라졌다. 지금은 **최소 모양만 요구**하므로 어느 쿼리의
 * 결과든 그대로 넣을 수 있다.
 */

/** `targetMuscle` 하나만 읽는 가벼운 `select`. 자식 종목 조회에 쓴다 */
export const MUSCLE_SELECT = {
  attributeValues: {
    where: { categoryAttribute: { attributeDefinition: { key: "targetMuscle" } } },
    select: {
      value: true,
      categoryAttribute: {
        select: {
          attributeDefinition: {
            select: { key: true, options: { select: { key: true, displayOrder: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.ItemSelect;

/**
 * 이 함수가 요구하는 최소 모양.
 *
 * ⚠️ **`options.displayOrder` 가 없으면 순서가 흔들린다.** 호출부의 `select` 에
 * 그 필드가 없으면 타입이 막는다 — 런타임에 조용히 뒤섞이지 않게 하려는 것이다.
 */
type MuscleRow = {
  value: Prisma.JsonValue;
  categoryAttribute: {
    attributeDefinition: {
      key: string;
      options: { key: string; displayOrder: number }[];
    };
  };
};

/** `multiselect` 는 `string[]` 로 저장된다 (`ItemAttributeValue.value` 주석) */
function listOf(row: MuscleRow): string[] {
  return Array.isArray(row.value)
    ? row.value.filter((v): v is string => typeof v === "string")
    : [];
}

/**
 * 속성값 행들에서 자극부위를 뽑는다.
 *
 * ⚠️ **`targetMuscle` 만 본다.** 호출부가 다른 속성까지 담은 `select` 를 넘겨도
 * 안전하다 — 아이템 상세가 그 경우다.
 *
 * ⚠️ **순서를 `displayOrder` 로 고정한다** (`FR-10-D-03`). 합집합을 만든 순서로
 * 내면 같은 루틴이 **새로고침마다 다르게** 보인다.
 */
export function musclesFrom(rows: readonly MuscleRow[]): string[] {
  const order = new Map<string, number>();
  const keys: string[] = [];

  for (const row of rows) {
    const def = row.categoryAttribute.attributeDefinition;
    if (def.key !== "targetMuscle") continue;
    for (const o of def.options) order.set(o.key, o.displayOrder);
    keys.push(...listOf(row));
  }

  return [...new Set(keys)].sort((a, b) => {
    const oa = order.get(a) ?? Number.MAX_SAFE_INTEGER;
    const ob = order.get(b) ?? Number.MAX_SAFE_INTEGER;
    // 순서를 모르는 키는 뒤로 보내되 이름순으로 **안정** 정렬한다
    return oa !== ob ? oa - ob : a.localeCompare(b);
  });
}

/**
 * 아이템 하나의 자극부위. **종목은 이것으로 끝난다** — 합집합이 필요 없다.
 * 그래서 루틴과 종목이 **같은 컴포넌트**를 쓸 수 있다 (D-224).
 */
export function musclesOf(item: { attributeValues: readonly MuscleRow[] }): string[] {
  return musclesFrom(item.attributeValues);
}

/**
 * 루틴의 자극부위 = 구성 종목의 **합집합** (`FR-10-D-01`).
 *
 * ⚠️ 루틴 자신의 값은 보지 않는다 — 루틴에는 `targetMuscle` 속성이 없다.
 * 있다면 시드가 잘못된 것이다.
 */
export function musclesOfRoutine(
  children: readonly { attributeValues: readonly MuscleRow[] }[],
): string[] {
  return musclesFrom(children.flatMap((c) => [...c.attributeValues]));
}
