import { prisma } from "@/lib/prisma";

/**
 * 브랜드 마스터 조회 — **매칭 키에 들어갈 브랜드 값을 정식 명칭으로 확정한다**
 * (D-043·D-044).
 *
 * ## ⚠️ 왜 필요한가
 * 유저 등록은 목록에서 고른 `Brand.name` **정확한 값**만 매칭 키에 넣는다
 * (`createItemAs` — "목록에서 브랜드를 선택해주세요"). 어드민·AI 경로가 자유
 * 텍스트를 넣으면 `트렉`·`Trek Bicycle Corporation` 같은 값이 키에 들어가고,
 * 그 도감은 **어떤 유저 아이템과도 만나지 않는다.** 도감은 멀쩡히 만들어지고
 * 보유자만 영원히 0명이라 알아채기 어렵다.
 *
 * ## ⚠️ 카테고리 연결까지 본다
 * 연결되지 않은 브랜드는 유저 선택 목록에 나오지 않으므로(D-044) 통과시켜도
 * 결과가 같다 — 비는 도감이 된다.
 */
export type BrandResolution =
  | { ok: true; name: string }
  | { ok: false; error: string };

export async function resolveMasterBrand(
  name: string,
  categoryKey: string,
): Promise<BrandResolution> {
  const brand = await prisma.brand.findFirst({
    // 대소문자만 다른 표기는 받아주고 **정식 명칭으로 바꿔 돌려준다** —
    // 어드민에게 "trek 은 안 되고 Trek 은 된다"를 요구할 이유가 없다
    where: { name: { equals: name, mode: "insensitive" }, active: true },
    select: { name: true, categories: { select: { key: true } } },
  });
  if (!brand) {
    return {
      ok: false,
      error: `브랜드 마스터에 없는 브랜드입니다 — "${name}". A-11 에서 먼저 등록하세요`,
    };
  }
  if (!brand.categories.some((c) => c.key === categoryKey)) {
    return {
      ok: false,
      error: `"${brand.name}" 이 이 카테고리에 연결되지 않았습니다 — 유저가 선택할 수 없어 도감이 비게 됩니다 (A-11)`,
    };
  }
  return { ok: true, name: brand.name };
}
