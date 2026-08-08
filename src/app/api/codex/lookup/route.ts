import { NextResponse } from "next/server";
import { normalizeBrandToken } from "@/lib/brand-search";
import { prisma } from "@/lib/prisma";

/**
 * 매칭 키로 도감 조회 + 자동 채움 값 (D-013, FR-03-A-01).
 *
 * ⚠️ **정규화 규칙은 D-014 하나만 쓴다** — 등록 Server Action(`actions/item.ts`)
 * 과 **같은 함수**를 호출한다. 폼이 자체 정규화를 들고 있으면 "폼에서는
 * 연결됐는데 저장하니 안 된다"가 생긴다.
 *
 * ⚠️ 자동 채워진 값도 **유저가 수정할 수 있다** (FR-03-A-03, 원칙 3).
 * 여기서는 값만 주고 잠그지 않는다.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const category = sp.get("category");
  const value = sp.get("key");
  if (!category || !value?.trim()) {
    return NextResponse.json({ error: "category와 key가 필요합니다" }, { status: 400 });
  }

  const codex = await prisma.codexItem.findFirst({
    where: {
      category: { key: category },
      normalizedKey: normalizeBrandToken(value),
      // 병합으로 흡수된 도감에는 연결하지 않는다 — survivor 를 써야 한다 (D-016)
      mergedIntoId: null,
    },
    select: {
      id: true,
      displayName: true,
      uniqueId: true,
      verification: true,
      items: {
        where: { brandId: { not: null } },
        take: 1,
        select: { brand: { select: { name: true } } },
      },
    },
  });

  if (!codex) return NextResponse.json({ codex: null });

  // 도감이 들고 있는 값만 채운다. 없는 것을 추측해 채우지 않는다
  const values: Record<string, string> = {};
  if (codex.uniqueId) values.uniqueId = codex.uniqueId;
  const brand = codex.items[0]?.brand?.name;
  if (brand) values.brand = brand;

  return NextResponse.json({
    codex: {
      id: codex.id,
      displayName: codex.displayName,
      verified: codex.verification === "VERIFIED",
    },
    values,
  });
}
