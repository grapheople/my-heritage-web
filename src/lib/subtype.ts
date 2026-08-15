import { prisma } from "@/lib/prisma";

/**
 * 하위 제품군 해석 (D-207).
 *
 * ## ⚠️ 규칙은 한 곳에만 둔다
 * "제품군 것이 있으면 그것, 없으면 카테고리 것" 이 규칙이 여러 경로에 흩어지면
 * **조용히 갈린다** — D-190(브랜드 게이트만 자체 규칙) · D-197(매칭 해석기가
 * 두 벌) · D-202(표시 URL 과 동작 URL 이 다른 함수) 가 전부 같은 실패였다.
 * 등록·수정·어드민·봇·API 가 **이 파일만** 부른다.
 */

/** 매칭 키가 하나도 정의되지 않았을 때의 최후 기본값 — 기존 동작과 같다 */
const FALLBACK_KEY_ORDER = ["uniqueId"];

/**
 * 매칭 키 순서를 해석한다 (FR-01-A-05 — 순서가 정규화 순서다).
 *
 * ⚠️ **제품군 것이 있으면 카테고리 것을 무시한다.** 합치지 않는다 —
 * 텐트가 `uniqueId` 단일이고 카테고리가 `brand+model` 이면, 합치는 순간
 * 텐트 도감의 키가 카테고리와 달라져 **같은 제품이 두 도감**이 된다.
 */
export async function resolveMatchingKeyOrder(input: {
  categoryId: string;
  subtypeId?: string | null;
}): Promise<string[]> {
  if (input.subtypeId) {
    const bySubtype = await prisma.matchingKeyDefinition.findUnique({
      where: { subtypeId: input.subtypeId },
      select: { attributeKeys: true },
    });
    if (bySubtype) return bySubtype.attributeKeys;
  }
  const byCategory = await prisma.matchingKeyDefinition.findUnique({
    where: { categoryId: input.categoryId },
    select: { attributeKeys: true },
  });
  return byCategory?.attributeKeys ?? FALLBACK_KEY_ORDER;
}

/**
 * 등록 폼이 그릴 속성 행 = **카테고리 공통 + 선택된 제품군 전용**.
 *
 * ⚠️ **공통이 먼저다.** 브랜드·모델명 같은 공통 항목이 위에 오고 제품군 전용
 * (수용 인원·내한 온도)이 뒤따른다 — 카테고리를 바꿔도 폼 상단이 같아야
 * 유저가 매번 다시 읽지 않는다.
 *
 * 제품군을 고르지 않으면 공통만 나온다. **기존 6개 카테고리가 그 경우**이고
 * 지금과 완전히 같게 동작한다.
 */
export function attributeScopeWhere(input: {
  categoryId: string;
  subtypeId?: string | null;
}) {
  return {
    active: true,
    OR: [
      { categoryId: input.categoryId },
      ...(input.subtypeId ? [{ subtypeId: input.subtypeId }] : []),
    ],
  };
}

/** 제품군 정렬은 **공통 먼저, 그 다음 각자의 `displayOrder`** */
export const ATTRIBUTE_SCOPE_ORDER = [
  // 공통(categoryId 있음)이 먼저 오도록 — nulls last 로 제품군 행을 뒤로 보낸다
  { categoryId: { sort: "asc" as const, nulls: "last" as const } },
  { displayOrder: "asc" as const },
];

export type SubtypeOption = { id: string; key: string; label: string };

/**
 * 카테고리의 제품군 선택지. **없으면 빈 배열**이고, 그때 폼은 선택 UI 를
 * 그리지 않는다 — 캠핑 외 6개 카테고리가 그 경우다.
 */
export async function getSubtypeOptions(
  categoryKey: string,
  locale: "ko" | "ja" | "en",
): Promise<SubtypeOption[]> {
  const rows = await prisma.categorySubtype.findMany({
    where: { active: true, category: { key: categoryKey } },
    orderBy: { displayOrder: "asc" },
    select: { id: true, key: true, labelKo: true, labelJa: true, labelEn: true },
  });
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    // 어드민이 런타임에 늘리므로 `messages/*.json` 이 아니라 DB 라벨이다 (D-207)
    label: locale === "ja" ? r.labelJa : locale === "en" ? r.labelEn : r.labelKo,
  }));
}

/**
 * 유저가 보낸 제품군 key 를 검증해 id 로 바꾼다.
 *
 * ⚠️ **다른 카테고리의 제품군을 받지 않는다.** 폼이 보내는 값이라 신뢰할 수
 * 없다 — 캠핑 아이템에 자전거 제품군을 붙이면 속성 집합이 통째로 어긋난다.
 */
export async function resolveSubtypeId(input: {
  categoryId: string;
  subtypeKey?: string;
}): Promise<{ ok: true; subtypeId: string | null } | { ok: false; error: string }> {
  const key = input.subtypeKey?.trim();
  if (!key) return { ok: true, subtypeId: null };
  const row = await prisma.categorySubtype.findUnique({
    where: { categoryId_key: { categoryId: input.categoryId, key } },
    select: { id: true, active: true },
  });
  if (!row) return { ok: false, error: "존재하지 않는 종류입니다" };
  // 비활성 제품군으로 **새로 등록**하지 않는다 (D-036 과 같은 태도 —
  // 기존 아이템은 그대로 두고 신규만 막는다)
  if (!row.active) return { ok: false, error: "현재 선택할 수 없는 종류입니다" };
  return { ok: true, subtypeId: row.id };
}
