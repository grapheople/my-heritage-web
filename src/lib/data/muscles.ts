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
 * ## ⚠️ 순서를 고정한다
 * 합집합을 만든 순서로 내면 **같은 루틴이 새로고침마다 다르게 보인다.**
 * `AttributeOption.displayOrder` 를 기준으로 정렬한다 (`FR-10-D-03`).
 */

/** 자극부위를 읽기 위한 `select` 조각. 아이템 조회에 펼쳐 넣는다 */
export const MUSCLE_SELECT = {
  attributeValues: {
    where: { categoryAttribute: { attributeDefinition: { key: "targetMuscle" } } },
    select: {
      value: true,
      categoryAttribute: {
        select: {
          attributeDefinition: {
            select: { options: { select: { key: true, displayOrder: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.ItemSelect;

type WithMuscles = {
  attributeValues: {
    value: Prisma.JsonValue;
    categoryAttribute: {
      attributeDefinition: { options: { key: string; displayOrder: number }[] };
    };
  }[];
};

/** `multiselect` 는 `string[]` 로 저장된다 (`ItemAttributeValue.value` 주석) */
function values(row: WithMuscles["attributeValues"][number]): string[] {
  return Array.isArray(row.value)
    ? row.value.filter((v): v is string => typeof v === "string")
    : [];
}

/**
 * 아이템 하나의 자극부위. **종목은 이것으로 끝난다** — 합집합이 필요 없다.
 * 그래서 루틴과 종목이 **같은 컴포넌트**를 쓸 수 있다 (D-224).
 */
export function musclesOf(item: WithMuscles): string[] {
  return sortMuscles(item.attributeValues.flatMap(values), item);
}

/**
 * 루틴의 자극부위 = 구성 종목의 **합집합** (`FR-10-D-01`).
 *
 * ⚠️ 루틴 자신의 값은 보지 않는다 — 루틴에는 `targetMuscle` 속성이 없다.
 * 있다면 그것은 시드가 잘못된 것이다.
 */
export function musclesOfRoutine(children: WithMuscles[]): string[] {
  const all = children.flatMap((c) => c.attributeValues.flatMap(values));
  return sortMuscles(all, children[0]);
}

/** 중복 제거 + `displayOrder` 정렬 (`FR-10-D-03`) */
function sortMuscles(keys: string[], sample?: WithMuscles): string[] {
  const uniq = [...new Set(keys)];
  const order = new Map<string, number>();
  for (const row of sample?.attributeValues ?? []) {
    for (const o of row.categoryAttribute.attributeDefinition.options) {
      order.set(o.key, o.displayOrder);
    }
  }
  /*
    ⚠️ 순서를 모르는 키는 **뒤로 보내되 이름순으로** 안정 정렬한다. 그냥 두면
    `Map` 삽입 순서에 따라 렌더마다 달라진다
  */
  return uniq.sort((a, b) => {
    const oa = order.get(a) ?? Number.MAX_SAFE_INTEGER;
    const ob = order.get(b) ?? Number.MAX_SAFE_INTEGER;
    return oa !== ob ? oa - ob : a.localeCompare(b);
  });
}
