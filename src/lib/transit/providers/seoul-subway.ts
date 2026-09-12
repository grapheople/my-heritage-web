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
  /** 도착까지 남은 초. **0 이 흔하다** — 아래 `toArrival` 참조 */
  barvlDt?: string;
  /** "2분 20초 후" · "[3]번째 전역 (청계산입구)" · "전역 도착" */
  arvlMsg2?: string;
  /** 0 진입 · 1 도착 · 2 출발 · 3 전역출발 · 4 전역진입 · 5 전역도착 · 99 운행중 */
  arvlCd?: string;
  btrainSttus?: string;
};

/**
 * 한 행을 도착 1건으로 옮긴다.
 *
 * ## ⚠️ **초를 주는 노선과 안 주는 노선이 섞여 있다**
 * 같은 역(강남) 응답에서 2호선은 `barvlDt` 가 140·270 인데 **신분당선은 전부 0**
 * 이고 `arvlMsg2` 에 *"[3]번째 전역 (청계산입구)"* 만 온다 (2026-09-12 실측).
 * `barvlDt > 0` 만 남기던 처음 판정은 **신분당선을 통째로 버렸다** — 수지·판교에서
 * 화면이 늘 비어 보이는 자리였다.
 *
 * 그래서 초가 없으면 **메시지에서 정거장 수를 읽는다.** 둘 다 없을 때만 버린다.
 */
function toArrival(r: Row): { predictSec: number | null; stopsLeft?: number } | null {
  const sec = Number(r.barvlDt ?? 0);
  // 진입·도착은 초가 0 이어도 **지금 오는 차**다 — 버리면 가장 중요한 순간이 사라진다
  const imminent = r.arvlCd === "0" || r.arvlCd === "1";
  if (sec > 0) return { predictSec: sec };
  if (imminent) return { predictSec: 0 };

  const hops = /\[(\d+)\]\s*번째\s*전역/.exec(r.arvlMsg2 ?? "")?.[1];
  if (hops) return { predictSec: null, stopsLeft: Number(hops) };
  // "전역 도착"·"전역 출발" 처럼 한 정거장 앞인 경우
  if ((r.arvlMsg2 ?? "").startsWith("전역")) return { predictSec: null, stopsLeft: 1 };
  return null;
}

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
  /*
    ⚠️ **30건을 받는다.** 10건이면 노선이 많은 역에서 **뒤쪽 노선이 잘린다** —
    서울(1·4호선·공항철도·경의중앙선)은 22행이 온다. 한 역의 응답이라 크기를
    늘려도 호출 수는 그대로다.
  */
  const url = `${BASE}/${key}/json/realtimeStationArrival/0/30/${encodeURIComponent(station)}`;
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

/**
 * 같은 역을 가리키는 **다른 표기**.
 *
 * ## ⚠️ 역명에 "역" 이 붙은 것과 아닌 것이 섞여 있다
 * 서울역에서 **1·4호선·공항철도·경의중앙선의 `statnNm` 은 "서울"** 인데
 * **GTX-A 만 "서울역"** 이다 (2026-09-12 실측). 유저가 "서울역" 이라고 치면
 * **GTX-A 한 줄만** 나오고, 정작 타려는 1호선은 없다 — 화면만 보고는 왜 없는지
 * 알 수 없는 종류의 실패다.
 */
function variantOf(name: string): string | null {
  if (name.endsWith("역") && name.length > 2) return name.slice(0, -1);
  return null;
}

/**
 * 이 열차의 **종점** (D-325).
 *
 * `trainLineNm` 은 `"광운대행 - 시청방면"` 처럼 **종점과 다음 방면**을 한 문자열로
 * 준다. 앞부분만 떼어 쓴다.
 *
 * ## ⚠️ 상행·하행만으로는 탈 차를 고를 수 없다
 * **1호선 상행 하나에 종점이 넷이다** — 광운대·연천·의정부·청량리 (2026-09-12
 * 실측). 청량리에서 내릴 사람에게 연천행과 청량리행은 전혀 다른 열차다.
 *
 * ## ⚠️ `(급행)` 을 떼지 않는다
 * 공항철도는 `"인천공항2터미널행 - 공덕방면 (급행)"` 처럼 **꼬리에** 붙인다.
 * `-` 앞만 자르면 급행 표시가 사라져 **완행과 구분할 수 없다.**
 */
function terminus(r: Row): string | undefined {
  const line = r.trainLineNm?.trim();
  if (!line) return undefined;
  const head = line.split("-")[0]?.trim();
  if (!head) return undefined;
  return /\(급행\)/.test(line) ? `${head} (급행)` : head;
}

/** 방향 + 종점 — 후보 목록에 그대로 쓴다 */
function directionLabel(updnLine: string | undefined, termini: string[]): string {
  const dir = updnLine ?? "";
  /*
    ⚠️ **급행 표시는 요약에서 뗀다.** 공항철도 상행은 종점이 하나인데 완행·급행이
    따로 와서, 그대로 두면 `인천공항2터미널행·인천공항2터미널행 (급행)` 처럼
    **같은 이름이 두 번** 나온다 — 읽는 사람에게는 버그로 보인다. 급행 여부는
    도착 행마다 그대로 나오므로 요약에서 잃을 것이 없다.
  */
  const base = [...new Set(termini.map((x) => x.replace(/\s*\(급행\)$/, "")))];
  if (base.length === 0) return dir;
  /*
    ⚠️ **전부 나열하지 않는다.** 1호선 상행은 넷이라 한 줄에 담기지 않고, 목록에서
    정작 중요한 **역 이름과 호선**을 밀어낸다. 둘까지 보이고 나머지는 수로 말한다
  */
  const head = base.slice(0, 2).join("·");
  const rest = base.length - 2;
  return dir ? `${dir} · ${head}${rest > 0 ? ` 외 ${rest}` : ""}` : head;
}

async function search({ q }: { q?: string }): Promise<StopCandidate[]> {
  const name = q?.trim();
  // 좌표만 온 경우 — 이 제공자는 답할 수 없다 (위 주석)
  if (!name) return [];

  const rows = await fetchRows(name);
  /*
    ⚠️ **비어 있을 때만 다시 묻는 것으로는 부족하다.** "서울역" 은 GTX-A 로 3행이
    오므로 비지 않는다 — 그런데도 1호선은 빠져 있다. 끝이 "역" 이면 **항상** 다른
    표기도 물어 합친다 (호출 1건 더 든다).
  */
  const alt = variantOf(name);
  if (alt) {
    try {
      rows.push(...(await fetchRows(alt)));
    } catch {
      // 다른 표기가 없는 역이면 그만이다 — 첫 결과를 버리지 않는다
    }
  }
  if (rows.length === 0) return [];

  /*
    같은 역에 호선·방향이 여럿이다. **방향까지 골라야** 도착 카운트가 의미를
    가지므로(반대편 열차를 세면 안 된다) 조합마다 후보를 낸다.
  */
  /*
    ⚠️ **먼저 모으고 나중에 만든다.** 한 (호선·방향)에 종점이 여럿이라, 첫 행만
    보고 후보를 만들면 나머지 종점이 사라진다 — 유저는 자기 열차가 없다고 본다.
  */
  const groups = new Map<string, { line: string; stop: string; updn?: string; termini: string[] }>();
  for (const r of rows) {
    const routeId = `${r.subwayId ?? ""}:${r.updnLine ?? ""}`;
    const g = groups.get(routeId) ?? {
      line: LINE[r.subwayId ?? ""] ?? r.subwayId ?? "",
      stop: r.statnNm ?? name,
      updn: r.updnLine ?? undefined,
      termini: [],
    };
    const end = terminus(r);
    if (end && !g.termini.includes(end)) g.termini.push(end);
    groups.set(routeId, g);
  }

  return [...groups.entries()].map(([routeId, g]) => ({
    kind: "SUBWAY" as const,
    stopId: g.stop,
    stopName: g.stop,
    routes: [{ routeId, routeName: g.line, headsign: directionLabel(g.updn, g.termini) }],
  }));
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
    .flatMap((r) => {
      const id = `${r.subwayId ?? ""}:${r.updnLine ?? ""}`;
      if (routeId && id !== routeId) return [];
      const got = toArrival(r);
      if (!got) return [];
      return [
        {
          routeId: id,
          routeName: LINE[r.subwayId ?? ""] ?? r.subwayId ?? "",
          // ⚠️ 행마다 종점이 다르다 — 그 차가 어디까지 가는지가 탈지 말지를 가른다
          headsign: terminus(r) ?? r.updnLine ?? undefined,
          ...got,
        },
      ];
    })
    /*
      ⚠️ **초가 있는 것을 앞에 세운다.** 초와 정거장 수를 한 자로 비교할 수 없으니
      (정거장 하나가 몇 초인지는 구간마다 다르다) 초가 있는 쪽을 먼저, 그 안에서
      작은 순으로, 나머지는 정거장 수 순으로 둔다.
    */
    .sort((a, b) => {
      if (a.predictSec !== null && b.predictSec !== null) return a.predictSec - b.predictSec;
      if (a.predictSec !== null) return -1;
      if (b.predictSec !== null) return 1;
      return (a.stopsLeft ?? 99) - (b.stopsLeft ?? 99);
    })
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
