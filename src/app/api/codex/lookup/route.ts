import { NextResponse } from "next/server";
import { normalizeBrandToken } from "@/lib/brand-search";
import { resolveCodexByKey } from "@/lib/codex-match-key";
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
 *
 * ## ⚠️ 매칭 해석기를 저장 경로와 **공유한다** (D-197)
 * 예전에는 여기만 `normalizedKey` 직접 조회였다. 그러면 **키 alias 로 연결될
 * 값이 미리보기에서는 "도감 없음"으로 보이다가 저장 때 조용히 연결된다** —
 * 위 주석이 경고한 "폼과 저장이 어긋나는" 상태의 거울상이다.
 * `resolveCodexByKey` 하나만 쓴다.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const category = sp.get("category");
  const value = sp.get("key");
  if (!category || !value?.trim()) {
    return NextResponse.json({ error: "category와 key가 필요합니다" }, { status: 400 });
  }

  const cat = await prisma.category.findUnique({
    where: { key: category },
    select: { id: true },
  });
  if (!cat) return NextResponse.json({ codex: null });

  const normalizedKey = normalizeBrandToken(value);
  // 저장 경로와 **같은 해석기** — 정식 값 → 키 alias 순 (FR-02-B-01·05)
  const hit = await resolveCodexByKey({ categoryId: cat.id, normalizedKey });
  if (!hit) return NextResponse.json({ codex: null });

  const codex = await prisma.codexItem.findUnique({
    where: { id: hit.codexItemId },
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
      /*
        FR-03-E-03 — **키 alias 로 찾았으면 저장 전에 알린다.** 유저가 넣은 값과
        도감의 정식 값이 다르므로, 말하지 않으면 "내 번호가 아닌 도감"으로 읽힌다
      */
      matchedByAlias: hit.via === "keyAlias",
    },
    values,
  });
}
