import { NextResponse } from "next/server";
import { normalizeBrandToken } from "@/lib/brand-search";
import { prisma } from "@/lib/prisma";

/**
 * 브랜드 요청 전 중복 검사 (S-17, FR-09-A-06·07).
 *
 * 두 가지를 본다:
 * 1. **이미 마스터에 있는가** — 원문 또는 alias 와 일치 (FR-09-A-07).
 *    있으면 요청 대신 그걸 고르라고 안내한다
 * 2. **이미 대기 중인 요청인가** — 같은 요청은 합친다 (FR-09-A-06)
 *
 * ⚠️ 정규화는 D-014 규칙 하나만 쓴다. import·검색·등록과 같은 함수다 —
 * 다르면 `Snow Peak` 과 `snowpeak` 이 다른 브랜드로 취급된다.
 */
export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ existing: null, pendingCount: 0 });

  const nq = normalizeBrandToken(name);

  // alias 는 Json 이라 SQL 로 정규화 비교를 못 한다. 활성 브랜드만 훑는다
  const brands = await prisma.brand.findMany({
    where: { active: true },
    select: { name: true, aliases: true },
  });

  const existing = brands.find((b) => {
    if (normalizeBrandToken(b.name) === nq) return true;
    const a = (b.aliases ?? {}) as Record<string, unknown>;
    return (["ko", "ja", "en"] as const).some((k) =>
      Array.isArray(a[k])
        ? (a[k] as unknown[]).some(
            (v) => typeof v === "string" && normalizeBrandToken(v) === nq,
          )
        : false,
    );
  });

  const pending = await prisma.brandRequest.findMany({
    where: { status: "PENDING" },
    select: { requestedName: true },
  });
  const pendingCount = pending.filter(
    (r) => normalizeBrandToken(r.requestedName) === nq,
  ).length;

  return NextResponse.json({
    existing: existing ? { name: existing.name } : null,
    pendingCount,
  });
}
