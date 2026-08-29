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
    select: { name: true, aliases: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    {
      brands: brands.map((b) => ({
        name: b.name,
        aliases: b.aliases as BrandAliases,
      })),
    },
    // 브랜드 마스터는 유저별이 아니고 자주 바뀌지 않는다 — 짧게 캐시한다
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
  );
}
