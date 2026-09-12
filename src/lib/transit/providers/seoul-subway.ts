import { TransitPortalError } from "../types";
import type { Arrival, StopCandidate, TransitProvider } from "../types";

/**
 * 서울 열린데이터광장 **지하철 실시간 도착** (D-321).
 *
 * `http://swopenapi.seoul.go.kr/api/subway/{KEY}/json/realtimeStationArrival/0/10/{역명}`
 *
 * ## ⚠️ 역명이 곧 키다
 * 이 API 는 역 코드가 아니라 **역명 문자열**로 조회한다. 그래서 `stopId` 에 역명을
 * 그대로 담는다 — 다른 제공자와 모양이 달라 보이지만, 억지로 코드 체계를 만들면
 * 그 변환표를 우리가 관리하게 된다.
 *
 * ## ⚠️ 좌표로 못 찾는다
 * 역 목록·좌표 API 가 따로라 활용신청이 하나 더 필요하다. 지금은 **이름 검색만**
 * 지원하고, 좌표가 오면 빈 배열을 낸다 — "없다" 가 아니라 "이 제공자가 답할 수
 * 없는 질문" 이므로 호출부가 지하철은 이름으로 찾게 안내한다.
 *
 * ## ⚠️ 수도권이지만 전국은 아니다
 * 서울교통공사 1~8호선과 연계 노선이 담긴다. 없는 역을 물으면 빈 결과가 온다.
 */

const BASE = process.env.SEOUL_SUBWAY_ENDPOINT?.trim() || "http://swopenapi.seoul.go.kr/api/subway";

function serviceKey(): string | null {
  return process.env.SEOUL_OPENAPI_KEY?.trim() || null;
}

const TIMEOUT_MS = 8_000;

type Row = {
  statnNm?: string;
  subwayId?: string;
  updnLine?: string;
  trainLineNm?: string;
  barvlDt?: string;
  arvlMsg2?: string;
  btrainSttus?: string;
};

/** 호선 코드 → 사람이 읽는 이름. 응답에 호선명이 없고 코드만 온다 */
const LINE: Record<string, string> = {
  "1001": "1호선", "1002": "2호선", "1003": "3호선", "1004": "4호선",
  "1005": "5호선", "1006": "6호선", "1007": "7호선", "1008": "8호선",
  "1009": "9호선", "1061": "중앙선", "1063": "경의중앙선", "1065": "공항철도",
  "1067": "경춘선", "1071": "수의분당선", "1075": "분당선", "1077": "신분당선",
  "1092": "우이신설선", "1093": "서해선", "1081": "경강선", "1032": "GTX-A",
};

async function fetchRows(station: string): Promise<Row[]> {
  const key = serviceKey();
  if (!key) return [];
  const url = `${BASE}/${key}/json/realtimeStationArrival/0/10/${encodeURIComponent(station)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`서울 지하철 ${res.status}`);

  const body = (await res.json()) as {
    realtimeArrivalList?: Row[];
    /** 오류가 **두 모양**으로 온다 — 아래 주석 참조 */
    code?: string;
    message?: string;
    errorMessage?: { status?: number; message?: string; code?: string };
  };
  /*
    ⚠️ **오류가 최상위로 올 때가 있다.** 인증키가 틀리면 `errorMessage` 가 아니라
    **최상위에** `{"status":500,"code":"INFO-100","message":"인증키가 유효하지
    않습니다"}` 가 온다 (2026-09-12 실측). `errorMessage` 만 보던 코드는 그것을
    **빈 배열로 흘려보내** 화면이 "역을 찾지 못했다" 라고 했다 — 유저는 역 이름을
    계속 바꿔 보게 된다. HTTP 는 200 이라 상태코드로도 걸러지지 않는다.
  */
  const code = body.errorMessage?.code ?? body.code;
  const message = body.errorMessage?.message ?? body.message;
  /*
    ⚠️ **`INFO-200`(해당 데이터 없음)은 오류가 아니다.** 막차 이후나 없는 역을
    물으면 이 코드가 온다 — 던지면 화면이 "포털 오류" 로 읽는다.
  */
  if (code && code !== "INFO-000" && code !== "INFO-200") {
    const reason = code === "INFO-100" ? "not-registered" : "portal-error";
    throw new TransitPortalError(reason, "realtimeStationArrival", `서울 지하철 ${code} ${message ?? ""}`.trim());
  }
  return body.realtimeArrivalList ?? [];
}

async function search({ q }: { q?: string }): Promise<StopCandidate[]> {
  const name = q?.trim();
  // 좌표만 온 경우 — 이 제공자는 답할 수 없다 (위 주석)
  if (!name) return [];

  const rows = await fetchRows(name);
  if (rows.length === 0) return [];

  /*
    같은 역에 호선·방향이 여럿이다. **방향까지 골라야** 도착 카운트가 의미를
    가지므로(반대편 열차를 세면 안 된다) 조합마다 후보를 낸다.
  */
  const seen = new Set<string>();
  const out: StopCandidate[] = [];
  for (const r of rows) {
    const line = LINE[r.subwayId ?? ""] ?? r.subwayId ?? "";
    const routeId = `${r.subwayId ?? ""}:${r.updnLine ?? ""}`;
    if (seen.has(routeId)) continue;
    seen.add(routeId);
    out.push({
      kind: "SUBWAY",
      stopId: r.statnNm ?? name,
      stopName: r.statnNm ?? name,
      routes: [{ routeId, routeName: line, headsign: r.updnLine ?? undefined }],
    });
  }
  return out;
}

async function arrivals({
  stopId,
  routeId,
}: {
  stopId: string;
  routeId?: string;
}): Promise<Arrival[]> {
  const rows = await fetchRows(stopId);
  const seen = new Map<string, number>();
  return rows
    .map((r) => ({
      routeId: `${r.subwayId ?? ""}:${r.updnLine ?? ""}`,
      routeName: LINE[r.subwayId ?? ""] ?? r.subwayId ?? "",
      headsign: r.trainLineNm ?? r.updnLine ?? undefined,
      /*
        ⚠️ `barvlDt` 가 **0 인 행이 많다.** 진입·도착처럼 초를 셀 수 없는 상태를
        0 으로 주기 때문이다. 0 을 그대로 쓰면 화면이 "0초 뒤 도착" 을 계속
        띄운다 — 초가 있는 행만 센다.
      */
      predictSec: Number(r.barvlDt ?? 0),
    }))
    .filter((a) => a.predictSec > 0 && (!routeId || a.routeId === routeId))
    .sort((a, b) => a.predictSec - b.predictSec)
    .flatMap((a) => {
      const seq = (seen.get(a.routeId) ?? 0) + 1;
      seen.set(a.routeId, seq);
      return seq <= 2 ? [{ ...a, seq }] : [];
    });
}

export const seoulSubway: TransitProvider = {
  id: "seoul-subway",
  label: "서울 지하철 실시간 도착",
  kind: "SUBWAY",
  isConfigured: () => serviceKey() !== null,
  search,
  arrivals,
};
