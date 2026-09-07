import { buildBrandIndex, type BrandRef } from "@/lib/codex-brand";
import { pickDisplayName } from "@/lib/display-name";
import { prisma } from "@/lib/prisma";
import { brandScopesWhere } from "@/lib/scope";

/**
 * 브랜드 조회 계층 — **필터가 쓰는 두 가지** (D-289 확장).
 *
 * ## ⚠️ 브랜드 추정 규칙을 여기에 복사하지 않는다
 * `CodexItem` 에는 브랜드 링크가 없어 이름에서 추정한다. 그 규칙의 단일 출처는
 * `lib/codex-brand.ts` 다 — 여기는 **재료(후보표)를 만들어 넘길 뿐**이다.
 * 복사해 두면 한쪽만 고쳐져 조용히 갈린다 (D-190·D-197·D-270 과 같은 실패).
 */

/**
 * 브랜드 추정 후보표를 만든다.
 *
 * @param categoryKey 주면 그 카테고리 것만. **어드민 전 카테고리 목록은 비운다**
 *
 * ⚠️ **후보는 그 카테고리의 브랜드 전부여야 한다** (D-285). 일부만 넣으면 긴
 * 이름이 짧은 이름을 가려주지 못해 `Yeti Cycles ARC Frame` 이 `YETI` 로 잡힌다.
 */
export async function loadBrandIndex(
  categoryKey?: string,
): Promise<Map<string, BrandRef[]>> {
  const scopes = await prisma.brandScope.findMany({
    where: categoryKey ? { category: { key: categoryKey } } : undefined,
    select: { category: { select: { key: true } }, brand: { select: { name: true } } },
  });
  return buildBrandIndex(
    scopes.map((s) => ({ categoryKey: s.category.key, brandName: s.brand.name })),
  );
}

export type BrandOption = {
  /** **원문**(`Brand.name`). URL·필터·매칭이 전부 이 값을 쓴다 (D-276) */
  name: string;
  /** 화면에 띄우는 이름. 언어별 명칭이 없으면 원문으로 떨어진다 */
  label: string;
};

/**
 * 브랜드 선택지 — 도감 필터가 쓰는 목록.
 *
 * ## ⚠️ 종류를 주면 **더해진다, 좁아지지 않는다** (D-255)
 * 브랜드 scope 는 포함적이다 — 카테고리 공통 ∪ 종류 전용. 종류를 안 보내면
 * **종류 전용 브랜드가 통째로 빠진다** (D-283 이 등록 폼에서 겪은 것과 같다).
 *
 * ## ⚠️ 표시명은 **서버에서 고른다**
 * `/api/brands` 는 공유 캐시에 들어가므로 3종을 다 내려보내고 고르는 일을
 * 클라이언트가 했다 (D-276). 이 함수는 캐시에 들어가지 않는 서버 렌더 경로라
 * 뷰어의 관심 언어권으로 여기서 고른다 — 클라이언트로 3종을 넘길 이유가 없다.
 *
 * 비활성 브랜드는 제외한다 — 신규 선택지가 아니다 (D-036 과 같은 논리).
 */
export async function listBrandOptions(input: {
  categoryKey: string;
  subtypeKey?: string | null;
  langOrder: string[];
}): Promise<BrandOption[]> {
  const rows = await prisma.brand.findMany({
    where: {
      active: true,
      scopes: brandScopesWhere({
        categoryKey: input.categoryKey,
        subtypeKey: input.subtypeKey,
      }),
    },
    select: { name: true, nameKo: true, nameJa: true, nameEn: true },
    // D-285 — 높을수록 앞. 같은 값이면 원문 사전순
    orderBy: [{ displayOrder: "desc" }, { name: "asc" }],
  });
  return rows.map((b) => ({
    name: b.name,
    label: pickDisplayName(b, b.name, input.langOrder),
  }));
}
