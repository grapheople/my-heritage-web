import type { SignalState } from "./cycle";
import type { Direction, LiveRef, SignalKind } from "./lights";

/**
 * 서울 C-ITS 실시간 신호 — 서울교통 빅데이터 포털(T-Data) "신호제어기 신호 정보
 * 서비스" 어댑터.
 *
 * 요청: `?apiKey=&type=json&itstId=`
 * 응답: 8방위 × 6종(직진 Stsg · 좌회전 Ltsg · 유턴 Utsg · 보행 Pdsg · 버스 Bssg ·
 * 자전거 Bcsg) 필드가 한 행에 늘어선다. 예) `ntPdsgStatNm` = 북측 보행신호 상태.
 *
 * ## ⚠️ 이 어댑터가 방어적으로 쓰인 이유
 * 포털 문서는 **상태 필드(`...StatNm`)만** 이름을 밝히고 잔여시간 필드명과 단위를
 * 밝히지 않는다. 그래서 이름을 추측해 박지 않고,
 *  - 같은 방위·종별 접두로 시작하는 **숫자 필드**를 잔여시간으로 집어내고,
 *  - 어느 필드를 썼는지·단위를 무엇으로 봤는지 **응답에 그대로 노출한다.**
 * 인증키를 받아 실제 응답을 한 번 보면 `TDATA_REMAINING_FIELD` ·
 * `TDATA_REMAINING_UNIT` 로 고정할 수 있다. 그때까지는 추측이라는 사실을 숨기지
 * 않는 편이 낫다.
 */

const ENDPOINT =
  process.env.TDATA_SIGNAL_ENDPOINT?.trim() ||
  "http://t-data.seoul.go.kr/apig/apiman-gateway/tapi/v2xSignalPhaseInformation/1.0";

/**
 * 「교차로 Map 정보」 — 교차로 ID·이름·좌표 목록.
 *
 * ## ⚠️ 이것이 "내 앞의 신호등 id" 를 푸는 열쇠다
 * 실시간 조회는 `itstId` 를 요구하는데 그 값을 사람이 알 방법이 없다. 이 목록에
 * `itstId` + `mapCtptIntLat/Lot`(중심점 좌표)이 있어 **좌표로 찾을 수 있다.**
 * 다만 방위(8방위 중 어느 횡단보도인가)는 좌표로 풀리지 않는다 — 현시를 받아
 * 눈앞의 신호와 대조해야 한다 (`readPhases`).
 */
const MAP_ENDPOINT =
  process.env.TDATA_MAP_ENDPOINT?.trim() ||
  "http://t-data.seoul.go.kr/apig/apiman-gateway/tapi/v2xCrossroadMapInformation/1.0";

/** ⚠️ 신호는 초 단위로 바뀐다 — 캐시를 길게 잡으면 그 자체가 오차다 */
const CACHE_TTL_MS = 900;
/** 실시간이 늦으면 기다리지 않고 주기 계산으로 넘어간다 */
const TIMEOUT_MS = 2_000;

const KIND_CODE: Record<SignalKind, string> = {
  straight: "Stsg",
  left: "Ltsg",
  uturn: "Utsg",
  pedestrian: "Pdsg",
  bus: "Bssg",
  bicycle: "Bcsg",
};

export type LiveReading = {
  state: SignalState;
  /** 초. 잔여시간 필드를 못 찾았으면 `null` */
  secondsRemaining: number | null;
  /** 진단용 — 어떤 필드를 어떻게 읽었는가 */
  detail: {
    stateField: string;
    stateRaw: string | number | null;
    remainingField?: string;
    remainingRaw?: number;
    unit?: "s" | "ds" | "cs";
  };
};

export function fieldBase(direction: Direction, kind: SignalKind): string {
  return `${direction}${KIND_CODE[kind]}`;
}

/**
 * C-ITS SPaT `MovementPhaseState` 코드. 숫자로 오는 경우가 있다.
 * 1 dark · 2 stop-then-proceed · 3 stop-and-remain · 4 pre-movement ·
 * 5/6 movement-allowed · 7/8 clearance · 9 caution
 */
const SPAT_STATE: Record<number, SignalState> = {
  1: "unknown",
  2: "red",
  3: "red",
  4: "red",
  5: "green",
  6: "green",
  7: "yellow",
  8: "yellow",
  9: "yellow",
};

export function normalizeState(raw: unknown): SignalState {
  if (raw === null || raw === undefined || raw === "") return "unknown";
  if (typeof raw === "number" || /^\d+$/.test(String(raw))) {
    return SPAT_STATE[Number(raw)] ?? "unknown";
  }
  const text = String(raw);
  if (/진행|녹색|초록|green|go|movement.?allowed|permissive|protected/i.test(text)) {
    return "green";
  }
  if (/정지|적색|빨강|red|stop/i.test(text)) return "red";
  if (/주의|황색|노란|yellow|amber|clearance|caution/i.test(text)) return "yellow";
  return "unknown";
}

/**
 * 응답 껍데기(`body.items[]`·`SignalPhaseInformation` 등)가 문서에 확정돼 있지
 * 않다. 그래서 **찾는 필드를 가진 객체를 JSON 안에서 탐색한다.** 껍데기 이름이
 * 바뀌어도 계속 동작한다.
 */
function findRow(payload: unknown, base: string): Record<string, unknown> | null {
  const queue: unknown[] = [payload];
  while (queue.length > 0) {
    const node = queue.shift();
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    if (typeof node !== "object" || node === null) continue;
    const obj = node as Record<string, unknown>;
    if (Object.keys(obj).some((k) => k.startsWith(base))) return obj;
    queue.push(...Object.values(obj));
  }
  return null;
}

/**
 * 잔여시간 후보. 상태 필드를 제외하고 같은 접두로 시작하는 숫자 필드를 집는다.
 * `TDATA_REMAINING_FIELD` 에 접미(예: `Rmdr`)를 주면 그것만 본다.
 */
function readRemaining(
  row: Record<string, unknown>,
  base: string,
): { field: string; raw: number } | null {
  const pinned = process.env.TDATA_REMAINING_FIELD?.trim();
  if (pinned) {
    const field = pinned.startsWith(base) ? pinned : `${base}${pinned}`;
    const n = Number(row[field]);
    return Number.isFinite(n) ? { field, raw: n } : null;
  }
  for (const [field, value] of Object.entries(row)) {
    if (!field.startsWith(base) || /StatNm$/.test(field)) continue;
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return { field, raw: n };
  }
  return null;
}

/**
 * 단위 환산. 기본은 자동 판정이다 — C-ITS 는 1/10초를 쓰는 곳이 있고 포털은
 * 단위를 밝히지 않는다. 한 현시가 200초를 넘는 신호등은 사실상 없으므로 그보다
 * 큰 값은 1/10초로 본다. `TDATA_REMAINING_UNIT=s|ds|cs` 로 고정할 수 있다.
 */
function toSeconds(raw: number): { seconds: number; unit: "s" | "ds" | "cs" } {
  const configured = process.env.TDATA_REMAINING_UNIT?.trim();
  if (configured === "s") return { seconds: raw, unit: "s" };
  if (configured === "ds") return { seconds: raw / 10, unit: "ds" };
  if (configured === "cs") return { seconds: raw / 100, unit: "cs" };
  return raw > 200 ? { seconds: raw / 10, unit: "ds" } : { seconds: raw, unit: "s" };
}

type CacheEntry = { at: number; payload: unknown };
const cache = new Map<string, CacheEntry>();

async function fetchIntersection(
  itstId: string,
  apiKey: string,
): Promise<{ payload: unknown; fetched: boolean }> {
  const hit = cache.get(itstId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { payload: hit.payload, fetched: false };

  const url = new URL(ENDPOINT);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("type", "json");
  url.searchParams.set("itstId", itstId);

  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    // 신호 상태를 Next 데이터 캐시에 얹으면 안 된다 — 위 Map 이 유일한 캐시다
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`T-Data ${res.status}`);
  const payload: unknown = await res.json();
  cache.set(itstId, { at: Date.now(), payload });
  return { payload, fetched: true };
}

export function isLiveConfigured(): boolean {
  return !!process.env.TDATA_API_KEY?.trim();
}

/**
 * ⚠️ **네트워크를 실제로 탔는지 함께 낸다** (`fetched`). 하루 한도는 호출 수로
 * 세야 하고, 0.9초 캐시에 맞은 요청은 한도를 쓰지 않는다 — 구분하지 않으면
 * 새로고침 두 번이 호출 두 건으로 기록된다.
 */
export type LiveResult = { reading: LiveReading | null; fetched: boolean };

function readRow(row: Record<string, unknown>, base: string): LiveReading {
  const stateField = `${base}StatNm`;
  const stateRaw = row[stateField];
  const remaining = readRemaining(row, base);
  const converted = remaining ? toSeconds(remaining.raw) : null;
  return {
    state: normalizeState(stateRaw),
    secondsRemaining: converted ? Math.ceil(converted.seconds) : null,
    detail: {
      stateField,
      stateRaw:
        typeof stateRaw === "string" || typeof stateRaw === "number" ? stateRaw : null,
      remainingField: remaining?.field,
      remainingRaw: remaining?.raw,
      unit: converted?.unit,
    },
  };
}

/**
 * 실시간 신호 한 건. 인증키가 없거나 응답에 해당 방위·종별 필드가 없으면
 * `reading` 이 `null` — 호출자는 주기 계산으로 넘어간다.
 */
export async function readLive(ref: LiveRef): Promise<LiveResult> {
  const apiKey = process.env.TDATA_API_KEY?.trim();
  if (!apiKey) return { reading: null, fetched: false };

  const { payload, fetched } = await fetchIntersection(ref.itstId, apiKey);
  const base = fieldBase(ref.direction, ref.kind);
  const row = findRow(payload, base);
  return { reading: row ? readRow(row, base) : null, fetched };
}

/** 한 교차로의 **8방위** 현시 — 눈앞의 신호와 대조해 방위를 특정할 때 쓴다 */
export type PhaseRow = {
  direction: Direction;
  state: SignalState;
  secondsRemaining: number | null;
  field: string;
};

export const DIRECTIONS: readonly Direction[] = [
  "nt",
  "ne",
  "et",
  "se",
  "st",
  "sw",
  "wt",
  "nw",
];

/**
 * 8방위를 한 번의 호출로 읽는다.
 *
 * ⚠️ 방위마다 따로 부르면 **호출이 8배**가 된다. 응답 한 행에 48개 필드가 모두
 * 들어 있으므로 한 번 받아 나눠 읽으면 된다.
 */
export async function readPhases(
  itstId: string,
  kind: SignalKind,
): Promise<{ rows: PhaseRow[]; fetched: boolean } | null> {
  const apiKey = process.env.TDATA_API_KEY?.trim();
  if (!apiKey) return null;

  const { payload, fetched } = await fetchIntersection(itstId, apiKey);
  const rows: PhaseRow[] = [];
  for (const direction of DIRECTIONS) {
    const base = fieldBase(direction, kind);
    const row = findRow(payload, base);
    if (!row) continue;
    const reading = readRow(row, base);
    rows.push({
      direction,
      state: reading.state,
      secondsRemaining: reading.secondsRemaining,
      field: reading.detail.stateField,
    });
  }
  return rows.length > 0 ? { rows, fetched } : null;
}

export type IntersectionRow = {
  itstId: string;
  name: string;
  engName?: string;
  lat: number;
  lon: number;
  laneWidth?: number;
  limitSpeed?: number;
};

/**
 * 좌표 정규화.
 *
 * ⚠️ C-ITS MAP 은 좌표를 **1/10 마이크로도 정수**로 싣는 곳이 있고(373968756 =
 * 37.3968756) 포털 샘플은 소수로 보인다. 문서가 단위를 밝히지 않으므로 값의
 * 크기로 판별한다 — 위도·경도가 절대값 1000 을 넘을 수 없다는 사실을 쓴다.
 */
function toDegrees(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.abs(n) > 1000 ? n / 1e7 : n;
}

/** `itstId` 를 가진 객체를 응답 전체에서 **모두** 모은다 (껍데기 이름과 무관하게) */
function collectRows(payload: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const queue: unknown[] = [payload];
  while (queue.length > 0) {
    const node = queue.shift();
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    if (typeof node !== "object" || node === null) continue;
    const obj = node as Record<string, unknown>;
    if ("itstId" in obj && ("mapCtptIntLat" in obj || "itstNm" in obj)) {
      found.push(obj);
      continue;
    }
    queue.push(...Object.values(obj));
  }
  return found;
}

/** 한 번에 받아올 행 수 — 크게 잡을수록 호출(=쿼터)이 줄어든다 */
const MAP_PAGE_SIZE = 1000;
/** 페이지 상한. 목록이 예상보다 크더라도 쿼터를 통째로 태우지 않게 막는다 */
const MAP_MAX_PAGES = 5;

/**
 * 교차로 목록 전체. 반환된 `requests` 만큼 하루 한도를 쓴 것이다.
 *
 * ⚠️ 이 함수를 화면에서 직접 부르지 않는다 — 결과는 DB 에 넣어두고 검색은
 * 로컬에서 한다 (`lib/signal/intersections.ts`).
 */
export async function fetchIntersectionMap(): Promise<{
  items: IntersectionRow[];
  requests: number;
}> {
  const apiKey = process.env.TDATA_API_KEY?.trim();
  if (!apiKey) return { items: [], requests: 0 };

  const items: IntersectionRow[] = [];
  let requests = 0;

  for (let page = 1; page <= MAP_MAX_PAGES; page += 1) {
    const url = new URL(MAP_ENDPOINT);
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("type", "json");
    url.searchParams.set("pageNo", String(page));
    url.searchParams.set("numOfRows", String(MAP_PAGE_SIZE));

    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS * 3), cache: "no-store" });
    requests += 1;
    if (!res.ok) throw new Error(`T-Data map ${res.status}`);
    const rows = collectRows(await res.json());

    for (const row of rows) {
      const itstId = String(row.itstId ?? "").trim();
      const lat = toDegrees(row.mapCtptIntLat);
      const lon = toDegrees(row.mapCtptIntLot);
      // 좌표 없는 행은 버린다 — 좌표로 찾는 것이 목적이므로 쓸 수 없다
      if (!itstId || lat === null || lon === null) continue;
      items.push({
        itstId,
        name: String(row.itstNm ?? itstId),
        engName: typeof row.itstEngNm === "string" ? row.itstEngNm : undefined,
        lat,
        lon,
        laneWidth: Number.isFinite(Number(row.laneWidth)) ? Number(row.laneWidth) : undefined,
        limitSpeed: Number.isFinite(Number(row.limitSped)) ? Number(row.limitSped) : undefined,
      });
    }
    // 마지막 페이지 — 요청한 것보다 적게 왔다
    if (rows.length < MAP_PAGE_SIZE) break;
  }

  return { items, requests };
}
