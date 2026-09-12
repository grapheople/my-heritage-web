import { distanceMeters } from "@/lib/geo";
import { TransitPortalError } from "../types";
import type { Arrival, StopCandidate, TransitProvider } from "../types";

/**
 * 국토교통부 **TAGO** 버스 도착정보 (D-321).
 *
 * | 오퍼레이션 | 쓰는 곳 |
 * |---|---|
 * | `BusSttnInfoInqireService/getCrdntPrxmtSttnList` | 좌표로 근처 정류소 |
 * | `BusSttnInfoInqireService/getSttnNoList` | 이름으로 정류소 |
 * | `ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList` | 정류소 도착예정 |
 *
 * ## ⚠️ 인증키가 **신호등 것과 다르다**
 * data.go.kr 인증키는 계정당 하나지만 **권한은 API 마다 따로** 붙는다. 실제로
 * `POLICE_SIGNAL_API_KEY` 로 TAGO 를 부르니 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`
 * 였다 (2026-09-12 실측). 같은 값이더라도 **변수를 나눠 둔다** — 한쪽 활용신청이
 * 끝나고 다른 쪽이 아직일 때 어느 쪽이 막힌 것인지 바로 보인다.
 *
 * ## ⚠️ 인증키를 `URLSearchParams` 에 넣지 않는다
 * 인코딩본은 이미 `%2F` 를 품고 있어 다시 인코딩하면 `%252F` 가 되어 깨진다.
 * 신호등 어댑터와 같은 이유다 (D-317).
 *
 * ## ⚠️ `cityCode` 없이는 도착정보를 못 받는다
 * 정류소 검색 응답의 `citycode` 를 **저장해 둬야** 한다. 도착정보 API 가 그것을
 * 요구하는데, 나중에 다시 알아낼 방법이 정류소를 또 검색하는 것뿐이다.
 */

const BASE = process.env.TAGO_ENDPOINT?.trim() || "https://apis.data.go.kr/1613000";

function serviceKey(): string | null {
  return process.env.TAGO_API_KEY?.trim() || null;
}

/** 포털이 느릴 때 화면을 붙잡지 않는다 — 유저가 누른 동작에서만 쓰인다 */
const TIMEOUT_MS = 8_000;

type Row = Record<string, string | number | undefined>;

const str = (v: Row[string]): string => (v === undefined ? "" : String(v));
const num = (v: Row[string]): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * 한 번 호출하고 `items.item` 을 배열로 편다.
 *
 * ⚠️ **1건이면 배열이 아니라 객체가 온다.** 공공데이터포털 공통 함정이다 —
 * `rows.map` 이 터지는 자리라, 여기서 한 번만 다룬다.
 */
async function get(path: string, params: Record<string, string>): Promise<Row[]> {
  const key = serviceKey();
  if (!key) return [];
  const qs = new URLSearchParams({ _type: "json", numOfRows: "30", pageNo: "1", ...params });
  const res = await fetch(`${BASE}/${path}?serviceKey=${key}&${qs}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  /*
    ⚠️ **상태코드로 먼저 끊지 않는다.** 활용신청이 안 된 서비스는 **403 과 함께
    본문에** `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 를 담아 준다. `res.ok` 로 먼저
    던지면 그 본문을 읽지 못해 "TAGO 403" 이라는 **아무것도 알려주지 않는 문구**가
    되고, 화면은 "신청이 필요하다" 대신 "포털 오류" 라고 말한다 — 실제로 그랬다
    (2026-09-12). 본문을 먼저 보고, 거기서 얻을 것이 없을 때만 상태코드를 쓴다.
  */
  const text = await res.text();
  /*
    ⚠️ **오류일 때 XML 이 온다.** `_type=json` 을 줘도 게이트웨이 단계 오류
    (등록되지 않은 서비스키 등)는 XML/HTML 로 답한다 — 그대로 `JSON.parse` 하면
    무슨 일인지 모를 `Unexpected token` 이 난다. 본문을 담아 던진다.
  */
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    // XML 로 온 오류도 같은 규칙으로 가른다 — 게이트웨이가 형식을 섞어 답한다
    const msg = /<errMsg>([^<]+)</.exec(text)?.[1] ?? text.slice(0, 120);
    if (msg.includes("SERVICE_KEY_IS_NOT_REGISTERED")) {
      const svc = path.split("/")[0];
      throw new TransitPortalError("not-registered", svc, `${svc} 활용신청이 안 돼 있다`);
    }
    throw new TransitPortalError("portal-error", path.split("/")[0], `TAGO ${res.status} — ${msg}`);
  }

  const b = body as {
    response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: { item?: Row | Row[] } } };
    OpenAPI_ServiceResponse?: { cmmMsgHeader?: { errMsg?: string; returnAuthMsg?: string } };
  };
  const gateway = b.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (gateway) {
    /*
      ⚠️ **활용신청이 서비스마다 따로다.** `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 는
      "키가 틀렸다" 가 아니라 **"이 서비스에 이 키가 등록돼 있지 않다"** 는 뜻이다 —
      같은 키로 도착정보는 200, 정류소정보는 403 이었다. 어느 쪽인지 이름을 실어
      올려야 화면이 "무엇을 신청해야 하는지" 를 말할 수 있다.
    */
    const service = path.split("/")[0];
    if (gateway.errMsg === "SERVICE_KEY_IS_NOT_REGISTERED_ERROR") {
      throw new TransitPortalError("not-registered", service, `${service} 활용신청이 안 돼 있다`);
    }
    throw new TransitPortalError(
      "portal-error",
      service,
      `TAGO ${gateway.errMsg ?? ""} ${gateway.returnAuthMsg ?? ""}`.trim(),
    );
  }
  const header = b.response?.header;
  // `00` 이 정상. `03`(데이터 없음)은 빈 배열이 맞는 답이라 던지지 않는다
  if (header?.resultCode && header.resultCode !== "00" && header.resultCode !== "03") {
    throw new Error(`TAGO ${header.resultCode} ${header.resultMsg ?? ""}`.trim());
  }
  // 본문에서 사유를 못 찾았는데 상태코드가 실패면 그때 상태코드를 쓴다
  if (!res.ok) throw new TransitPortalError("portal-error", path.split("/")[0], `TAGO ${res.status}`);

  const item = b.response?.body?.items?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

async function search({
  q,
  lat,
  lon,
}: {
  q?: string;
  lat?: number;
  lon?: number;
}): Promise<StopCandidate[]> {
  /*
    ⚠️ **좌표를 이름보다 앞에 둔다.** 이름 검색(`getSttnNoList`)은 `cityCode` 를
    요구해서 "어느 시인지" 를 먼저 알아야 한다 — 유저가 답할 수 없는 질문이다.
    지도 핀으로 좌표를 받는 경로가 이 기능의 주 입구인 이유이기도 하다.
  */
  const rows =
    lat !== undefined && lon !== undefined
      ? await get("BusSttnInfoInqireService/getCrdntPrxmtSttnList", {
          gpsLati: String(lat),
          gpsLong: String(lon),
        })
      : [];

  const byName = q?.trim()
    ? rows.filter((r) => str(r.nodenm).includes(q.trim()))
    : rows;

  const origin = lat !== undefined && lon !== undefined ? { lat, lon } : null;

  /*
    ⚠️ **거리를 계산해 가까운 것부터 준다.** 포털은 30건을 근접 순서라고 주지만
    실제로는 같은 이름의 양방향 정류장이 섞여 나오고, 화면에 30줄이 그대로 깔리면
    **어느 것이 길 건너편인지 구분할 수가 없다.** 거리를 보여주면 갈린다.

    ⚠️ 중복처럼 보여도 **합치지 않는다.** "수지구청.수지우체국" 이 둘인 것은
    상행·하행 정류장이라 `nodeId` 가 다르고 도착하는 버스도 다르다 — 합치면
    반대편 버스를 기다리게 된다.
  */
  return byName
    .map((r) => {
      const p = { lat: num(r.gpslati), lon: num(r.gpslong) };
      return {
        kind: "BUS" as const,
        stopId: str(r.nodeid),
        stopName: str(r.nodenm),
        cityCode: str(r.citycode),
        lat: p.lat,
        lon: p.lon,
        distanceM:
          origin && p.lat !== undefined && p.lon !== undefined
            ? Math.round(distanceMeters(origin, { lat: p.lat, lon: p.lon }))
            : undefined,
      };
    })
    .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))
    // 화면이 한눈에 들어오는 만큼만 — 30줄은 고르는 일을 오히려 어렵게 한다
    .slice(0, 10);
}

async function arrivals({
  stopId,
  cityCode,
  routeId,
}: {
  stopId: string;
  cityCode?: string;
  routeId?: string;
}): Promise<Arrival[]> {
  if (!cityCode) {
    // 저장할 때 함께 담지 않았다는 뜻이다 — 조용히 빈 배열을 내면 원인을 못 찾는다
    throw new Error("cityCode 가 없다 — 정류소를 다시 지정해야 한다");
  }
  const rows = await get("ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList", {
    cityCode,
    nodeId: stopId,
  });

  /*
    ⚠️ 같은 노선이 여러 대 온다. `arrtime` 오름차순으로 세워 **노선마다 1·2번째**
    만 남긴다 — 화면이 필요한 것은 "곧 올 차와 그다음" 이고, 5대를 다 보여주면
    어느 것을 기다릴지 오히려 판단이 어렵다.
  */
  const seen = new Map<string, number>();
  return rows
    .filter((r) => !routeId || str(r.routeid) === routeId)
    .map((r) => ({
      routeId: str(r.routeid),
      routeName: str(r.routeno),
      headsign: str(r.routetp) || undefined,
      // 버스는 `arrtime` 에 초를 반드시 준다 — 지하철과 달리 빈 경우가 없었다
      predictSec: num(r.arrtime) ?? 0,
      stopsLeft: num(r.arrprevstationcnt),
    }))
    .filter((a) => (a.predictSec ?? 0) > 0)
    .sort((a, b) => (a.predictSec ?? 0) - (b.predictSec ?? 0))
    .flatMap((a) => {
      const seq = (seen.get(a.routeId) ?? 0) + 1;
      seen.set(a.routeId, seq);
      return seq <= 2 ? [{ ...a, seq }] : [];
    });
}

export const tagoBus: TransitProvider = {
  id: "tago-bus",
  label: "국토교통부 버스도착정보(TAGO)",
  kind: "BUS",
  isConfigured: () => serviceKey() !== null,
  search,
  arrivals,
};
