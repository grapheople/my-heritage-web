import { NextResponse } from "next/server";
import type { BrandAliases } from "@/lib/brand-search";
import { prisma } from "@/lib/prisma";
import { brandScopesWhere } from "@/lib/scope";

/**
 * 카테고리별 브랜드 목록 (D-043, OI-54).
 *
 * ## 왜 검색어를 서버로 보내지 않는가
 * 카테고리당 브랜드가 30~111건이다. **한 번에 다 받아 클라이언트에서 랭킹**하면
 * 타이핑마다 요청하지 않아도 되고 즉시 반응한다. 목록이 수천 건이 되면
 * 서버 검색으로 바꿔야 하지만 지금 규모에서는 과설계다.
 *
 * ## 비활성 브랜드는 제외한다
 * `active: false` 는 운영에서 끈 것이다 (import `--prune` 또는 어드민 A-11).
 * 신규 등록에는 쓰지 못하지만 **기존 아이템의 값은 보존된다** — D-036 과 같은 논리.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const category = sp.get("category");
  // D-255 — 종류를 주면 그 종류 전용 브랜드가 **더해진다**(좁아지지 않는다)
  const subtype = sp.get("subtype");
  if (!category) {
    return NextResponse.json({ error: "category required" }, { status: 400 });
  }

  const brands = await prisma.brand.findMany({
    where: { active: true, scopes: brandScopesWhere({ categoryKey: category, subtypeKey: subtype }) },
    select: { name: true, aliases: true, nameKo: true, nameJa: true, nameEn: true, displayOrder: true },
    /*
      D-285 — **높을수록 앞**. 검색어가 없을 때의 브라우징 순서가 이것이다.
      검색어가 있으면 `searchBrands` 의 랭킹이 먼저고 우선순위는 동점만 가른다.

      ⚠️ 방향이 `desc` 인 것이 의도다 — 기본값 0 이 자연히 맨 뒤로 간다
    */
    orderBy: [{ displayOrder: "desc" }, { name: "asc" }],
  });

  return NextResponse.json(
    {
      brands: brands.map((b) => ({
        name: b.name,
        aliases: b.aliases as BrandAliases,
        nameKo: b.nameKo,
        nameJa: b.nameJa,
        nameEn: b.nameEn,
        displayOrder: b.displayOrder,
      })),
    },
    /*
      브랜드 마스터는 유저별이 아니고 자주 바뀌지 않는다 — 짧게 캐시한다.

      ⚠️ **여기서 표시명을 하나로 골라 내려보내면 안 된다** (D-276). 어느
      이름을 쓸지는 **뷰어의 관심 언어권**이 정하는데(D-274) 이 응답은
      `s-maxage` 로 **공유 캐시에 들어간다** — 먼저 요청한 사람의 언어가
      다음 사람에게 그대로 나간다. 3종을 다 내리고 **고르는 일은 클라이언트**가
      한다. 그래야 응답이 뷰어와 무관해져 캐시가 성립한다
    */
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
  );
}
