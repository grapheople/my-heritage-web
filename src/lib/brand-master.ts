import { normalizeBrandToken, type BrandAliases } from "@/lib/brand-search";
import { prisma } from "@/lib/prisma";

/**
 * 브랜드 마스터 조회 — **매칭 키에 들어갈 브랜드 값을 정식 명칭으로 확정한다**
 * (D-043·D-044·D-047).
 *
 * ## ⚠️ 왜 필요한가
 * 유저 등록은 목록에서 고른 `Brand.name` **정확한 값**만 매칭 키에 넣는다
 * (`createItemAs` — "목록에서 브랜드를 선택해주세요"). 어드민·AI 경로가 자유
 * 텍스트를 넣으면 `트렉`·`Trek Bicycle Corporation` 같은 값이 키에 들어가고,
 * 그 도감은 **어떤 유저 아이템과도 만나지 않는다.** 도감은 멀쩡히 만들어지고
 * 보유자만 영원히 0명이라 알아채기 어렵다.
 *
 * ## ⚠️ 비교는 **D-014 정규화 + alias** 로 한다 — 이름 완전일치로는 부족하다
 * 초판은 대소문자 무시 완전일치만 봤다. 그러면 `SnowPeak`(공백 없음)·`스노우피크`
 * 가 전부 거부된다 — **정규화(D-014)와 alias(D-047)가 이미 있는데 쓰지 않은 것**이다.
 * 자전거·캠핑·데스크테리어는 `brand` 가 매칭 키 구성이라(D-118) AI 조사가
 * 브랜드 표기를 직접 쓰고, 표기 차이로 대량 실패한다.
 *
 * 그래서 3단계로 찾는다. **어느 단계로 찾았든 돌려주는 값은 정식 명칭**이다 —
 * 매칭 키에는 유저 등록과 같은 값이 들어가야 한다.
 * 1. 이름 대소문자 무시 일치
 * 2. **정규화 일치** (공백·하이픈·언더스코어 제거 — D-014)
 * 3. **alias 정규화 일치** (ko/ja/en — D-047)
 *
 * ## ⚠️ 카테고리 연결까지 본다
 * 연결되지 않은 브랜드는 유저 선택 목록에 나오지 않으므로(D-044) 통과시켜도
 * 결과가 같다 — 비는 도감이 된다. 그래서 **먼저 카테고리 안에서 찾고**, 없으면
 * 전체에서 찾아 "마스터에 없음"과 "카테고리 미연결"을 구분해 알려준다.
 */
export type BrandResolution =
  | { ok: true; name: string }
  | { ok: false; error: string };

type Row = { name: string; aliases: unknown };

/** 정규화 기준으로 후보를 찾는다. 이름 → alias 순 */
function match(rows: Row[], query: string): Row[] {
  const nq = normalizeBrandToken(query);
  if (!nq) return [];

  const byName = rows.filter((r) => normalizeBrandToken(r.name) === nq);
  if (byName.length > 0) return byName;

  return rows.filter((r) => {
    const a = (r.aliases ?? {}) as BrandAliases;
    const list = [...(a.ko ?? []), ...(a.ja ?? []), ...(a.en ?? [])];
    return list.some((v) => typeof v === "string" && normalizeBrandToken(v) === nq);
  });
}

export async function resolveMasterBrand(
  name: string,
  categoryKey: string,
): Promise<BrandResolution> {
  const inCategory = await prisma.brand.findMany({
    where: { active: true, categories: { some: { key: categoryKey } } },
    select: { name: true, aliases: true },
  });

  const hits = match(inCategory, name);
  if (hits.length === 1) return { ok: true, name: hits[0].name };
  if (hits.length > 1) {
    /*
      ⚠️ 여러 브랜드가 같은 토큰으로 잡히면 **고르지 않는다.** 하나를 골라 넣으면
      잘못된 브랜드의 도감이 조용히 생기고, 나중에 어느 쪽이 맞았는지 알 수 없다.
    */
    return {
      ok: false,
      error: `브랜드가 여러 개 일치합니다 — "${name}" → ${hits.map((h) => h.name).join(", ")}. 정식 명칭으로 지정하세요`,
    };
  }

  // 카테고리 안에 없다 — 마스터 자체에 없는 것과 구분해서 알려준다
  const all = await prisma.brand.findMany({
    where: { active: true },
    select: { name: true, aliases: true },
  });
  const elsewhere = match(all, name);
  if (elsewhere.length > 0) {
    return {
      ok: false,
      error: `"${elsewhere[0].name}" 이 이 카테고리에 연결되지 않았습니다 — 유저가 선택할 수 없어 도감이 비게 됩니다 (A-11)`,
    };
  }
  return {
    ok: false,
    error: `브랜드 마스터에 없는 브랜드입니다 — "${name}". A-11 에서 먼저 등록하세요`,
  };
}
