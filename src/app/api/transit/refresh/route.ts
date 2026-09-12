import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { listFavorites, refreshFavorite } from "@/lib/transit/favorites";
import { prisma } from "@/lib/prisma";

/**
 * 도착정보를 **다시 받는다** (D-321).
 *
 * `POST /api/transit/refresh`           — 담아둔 전부
 * `POST /api/transit/refresh?id=…`      — 하나만
 *
 * ## ⚠️ 하루 한도를 여기서 본다
 * 포털은 API 별로 일일 호출 상한이 있다. 화면이 열릴 때마다 자동으로 부르면
 * 금방 태우므로, **유저가 누를 때**와 스냅샷이 낡았을 때만 부른다.
 *
 * ## ⚠️ 하나가 실패해도 나머지는 갱신한다
 * 한 정류소의 오류가 전체를 멈추면 화면이 통째로 빈다 (D-188·D-317 이 반복한 실패).
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** 하루 호출 상한 — 넘기면 저장된 스냅샷으로만 센다 */
const DAILY_LIMIT = Number(process.env.TRANSIT_PORTAL_DAILY_LIMIT ?? 300);

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "로그인이 필요하다" }, { status: 401, headers: NO_STORE });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const used = await prisma.transitPortalCall.count({ where: { createdAt: { gte: since } } });
  if (used >= DAILY_LIMIT) {
    return NextResponse.json(
      {
        error: "오늘 포털 호출 한도를 다 썼다",
        hint: "저장된 도착정보로 계속 셀 수 있다 — 값이 낡았을 수 있다",
        quota: { used, limit: DAILY_LIMIT },
      },
      { status: 429, headers: NO_STORE },
    );
  }

  const only = new URL(req.url).searchParams.get("id")?.trim();
  const favorites = await listFavorites(viewer.userId);
  const targets = only ? favorites.filter((f) => f.id === only) : favorites;
  if (targets.length === 0) {
    return NextResponse.json({ error: "담아둔 정류장이 없다" }, { status: 404, headers: NO_STORE });
  }
  /*
    ⚠️ **남은 한도 안에서만** 부른다. 8개를 담았는데 한도가 3회 남았다면 3개만
    새로 받고 나머지는 저장된 값으로 센다 — 전부 거절하면 화면이 통째로 멈춘다.
  */
  const budget = Math.max(0, DAILY_LIMIT - used);
  const results = [];
  for (const f of targets.slice(0, budget)) {
    results.push(await refreshFavorite(viewer.userId, f.id, viewer.userId));
  }

  return NextResponse.json(
    {
      results,
      skipped: Math.max(0, targets.length - budget),
      favorites: await listFavorites(viewer.userId),
    },
    { headers: NO_STORE },
  );
}
