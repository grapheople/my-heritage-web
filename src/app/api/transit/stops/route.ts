import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { searchStops } from "@/lib/transit/providers";

/**
 * 역·정류장 찾기 (D-321).
 *
 * `GET /api/transit/stops?kind=BUS&lat=37.27&lon=127.11`
 * `GET /api/transit/stops?kind=SUBWAY&q=수원`
 *
 * ## ⚠️ 종류마다 찾는 방법이 다르다
 * 버스는 **좌표**로 찾는다 — 이름 검색은 도시코드를 먼저 요구하는데 유저가 답할
 * 수 없는 질문이다. 지하철은 **이름**으로 찾는다 — 실시간 API 가 역명을 키로
 * 쓰고 좌표 API 는 활용신청이 따로다.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function coord(v: string | null, max: number): number | undefined {
  if (v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= max ? n : undefined;
}

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "로그인이 필요하다" }, { status: 401, headers: NO_STORE });
  }

  const sp = new URL(req.url).searchParams;
  const kind = sp.get("kind") === "SUBWAY" ? "SUBWAY" : sp.get("kind") === "BUS" ? "BUS" : null;
  if (!kind) {
    return NextResponse.json(
      { error: "kind 가 올바르지 않다 (BUS·SUBWAY)" },
      { status: 400, headers: NO_STORE },
    );
  }
  const q = sp.get("q")?.trim() || undefined;
  const lat = coord(sp.get("lat"), 90);
  const lon = coord(sp.get("lon"), 180);
  if (!q && (lat === undefined || lon === undefined)) {
    return NextResponse.json(
      { error: "q 또는 lat·lon 이 필요하다" },
      { status: 400, headers: NO_STORE },
    );
  }

  const got = await searchStops(kind, { q, lat, lon });
  if (!got.ok) {
    if (got.reason === "not-configured") {
      return NextResponse.json(
        {
          error: "이 종류는 아직 인증키가 없다",
          hint:
            kind === "BUS"
              ? "공공데이터포털에서 「국토교통부_버스도착정보」 활용신청 후 TAGO_API_KEY 에 넣는다"
              : "서울 열린데이터광장에서 「지하철 실시간 도착정보」 인증키를 받아 SEOUL_OPENAPI_KEY 에 넣는다",
        },
        { status: 503, headers: NO_STORE },
      );
    }
    // ⚠️ 포털 사유를 그대로 전한다 — 뭉치면 "왜 안 되는지" 를 아무도 모른다 (D-319)
    console.error(`[transit] ${kind} 정류장 검색 실패:`, got.detail);
    return NextResponse.json(
      { error: "정류장을 찾지 못했다", detail: got.detail },
      { status: 502, headers: NO_STORE },
    );
  }

  return NextResponse.json({ kind, stops: got.stops }, { headers: NO_STORE });
}
