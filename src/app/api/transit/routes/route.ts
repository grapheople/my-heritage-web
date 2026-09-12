import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { readRoutesAt } from "@/lib/transit/providers";

/**
 * 그 정류장을 **지나는 노선** (D-323).
 *
 * `GET /api/transit/routes?kind=BUS&stopId=GGB228000976&cityCode=31190`
 *
 * ## ⚠️ 도착정보로 대신할 수 없다
 * 도착정보는 *지금 오는 차*만 준다 — 배차가 긴 노선이나 막차 뒤에는 비어서,
 * 실제로 다니는 노선인데도 고를 수가 없다. 경유노선은 시간과 무관하다.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "로그인이 필요하다" }, { status: 401, headers: NO_STORE });
  }

  const sp = new URL(req.url).searchParams;
  const kind = sp.get("kind") === "SUBWAY" ? "SUBWAY" : sp.get("kind") === "BUS" ? "BUS" : null;
  const stopId = sp.get("stopId")?.trim();
  if (!kind || !stopId) {
    return NextResponse.json(
      { error: "kind·stopId 가 필요하다" },
      { status: 400, headers: NO_STORE },
    );
  }

  const got = await readRoutesAt(kind, { stopId, cityCode: sp.get("cityCode")?.trim() || undefined });
  if (!got.ok) {
    if (got.reason === "not-registered") {
      return NextResponse.json(
        { error: "이 포털 서비스에 인증키가 등록돼 있지 않다", service: got.service },
        { status: 503, headers: NO_STORE },
      );
    }
    if (got.reason === "not-configured") {
      return NextResponse.json({ error: "인증키가 없다" }, { status: 503, headers: NO_STORE });
    }
    console.error(`[transit] ${stopId} 경유노선 조회 실패:`, got.detail);
    return NextResponse.json(
      { error: "노선을 받지 못했다", detail: got.detail },
      { status: 502, headers: NO_STORE },
    );
  }

  /*
    ⚠️ **빈 목록이 오류가 아니다.** 포털에 그 정류장의 노선 데이터가 없는 경우가
    있다(실측: `GGB228000919`). 화면은 이때 **정류장 전체로 담기**를 내야 한다 —
    "노선 없음" 으로 막으면 그 정류장은 영영 담을 수 없다.
  */
  return NextResponse.json({ kind, stopId, routes: got.routes }, { headers: NO_STORE });
}
