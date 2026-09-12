import type { SignalState } from "../cycle";
import type { Direction, LiveRef, SignalKind } from "../lights";
import type {
  Coords,
  IntersectionRow,
  LiveReading,
  LiveResult,
  PhaseRow,
  SignalProvider,
} from "./types";

/**
 * **행정안전부 한국지역정보개발원 — (전국 통합데이터) 교통안전 신호등 실시간 정보** (D-317).
 *
 * `https://apis.data.go.kr/B551982/rti/…` · 공공데이터포털 `serviceKey` 인증.
 *
 * **명세**: `https://ido.sharedata.go.kr/dcat/swagger/swagger-d0007.json` (Swagger).
 * 오퍼레이션은 **둘뿐**이고 파라미터도 `serviceKey`·`stdgCd`(지자체 코드) 둘뿐이다 —
 * 추측할 여지가 없으니 다음 사람은 이 파일을 고치기 전에 명세를 먼저 열 것.
 *
 * ## ⚠️ 이것이 **유일한 제공자다** (D-320)
 * 이 API 는 **한 응답에 상태와 잔여시간이 함께** 있고 좌표 목록도 같은 키로
 * 열린다 — 이 기능이 필요한 세 가지가 전부 있다.
 *
 * ## 실측으로 확정한 규격 (2026-09-11)
 * | 항목 | 값 |
 * |---|---|
 * | 잔여 필드 | `{방위}{종별}RmndCs` |
 * | 잔여 단위 | ⚠️ **1/1000초(ms)** — 이름도 명세도 "센티초" 라고 하지만 아니다 |
 * | 상태 필드 | `{방위}{종별}SttsNm` |
 * | 상태 어휘 | SAE J2735 — `protected-Movement-Allowed` · `stop-And-Remain` 등 |
 * | 방위·종별 | nt/et/st/wt/ne/se/sw/nw × Bssg/Bcsg/Ltsg/Pdsg/Stsg/Utsg |
 *
 * ## ⚠️ 명세와 데이터가 어긋난다 — **데이터가 이긴다**
 * Swagger 명세는 `ntBssgRmndCs` 를 **"북쪽버스신호잔여_센티초"** 라고 적는다.
 * 그런데 같은 교차로를 **10.2초 간격으로 두 번 찍으니 값이 정확히 10000 줄었다** —
 * 센티초면 100초가 흘렀어야 한다. 황색(`clearance`)이 `3000` 인 것도 ms 여야
 * 3초로 맞는다 (센티초면 30초다).
 *
 * 이름도 명세도 틀릴 수 있다. **재보는 것이 유일한 확인**이다.
 *
 * ## ⚠️ 교차로 id 는 **지자체 안에서만** 유일하다
 * 서울 `crsrdId=1` 은 이촌역앞, 울산 `crsrdId=1` 은 다른 곳이다. 그래서 이
 * 어댑터는 **`stdgCd:crsrdId`** 를 하나의 id 로 쓴다 — 섞이면 다른 도시의 신호를
 * 내 신호등으로 보게 된다.
 */

const BASE =
  process.env.KLID_SIGNAL_ENDPOINT?.trim() || "https://apis.data.go.kr/B551982/rti";

/**
 * ⚠️ **URL 인코딩된 일반 인증키를 그대로** 붙인다. `URLSearchParams` 에 넣으면
 * `%2F` 가 `%252F` 로 다시 인코딩돼 인증이 깨진다 — 그래서 문자열로 잇는다.
 */
function serviceKey(): string | null {
  return process.env.POLICE_SIGNAL_API_KEY?.trim() || null;
}

/** 한 번에 받는 행 수. 좌표 목록이 4,239건이라 5회면 다 받는다 */
const PAGE_SIZE = 1000;
const MAX_PAGES = 8;
/** 신호는 초 단위로 바뀐다 — 캐시를 길게 잡으면 그 자체가 오차다 */
const CACHE_TTL_MS = 900;
const TIMEOUT_MS = 4_000;

/** SAE J2735 MovementPhaseState → 우리 상태 (실측 어휘 기준) */
const STATE: Record<string, SignalState> = {
  "protected-Movement-Allowed": "green",
  "permissive-Movement-Allowed": "green",
  "protected-clearance": "yellow",
  "permissive-clearance": "yellow",
  "stop-And-Remain": "red",
  "stop-Then-Processed": "red",
  "caution-Conflicting-Traffic": "yellow",
  dark: "unknown",
  unavailable: "unknown",
};

const KIND_CODE: Record<SignalKind, string> = {
  straight: "Stsg",
  left: "Ltsg",
  uturn: "Utsg",
  pedestrian: "Pdsg",
  bus: "Bssg",
  bicycle: "Bcsg",
};

function fieldBase(direction: Direction, kind: SignalKind): string {
  return `${direction}${KIND_CODE[kind]}`;
}

type Row = Record<string, string>;
type Cached = { at: number; rows: Row[] };
let liveCache: Cached | null = null;

/**
 * ⚠️ **인증키를 `URLSearchParams` 에 넣지 않는다.** 포털은 "일반 인증키" 를
 * **Encoding·Decoding 두 벌**로 준다. 인코딩본은 이미 `%2F` 를 품고 있어 다시
 * 인코딩하면 `%252F` 가 되어 인증이 깨진다 — 그래서 **문자열로 잇는다.**
 *
 * ⚠️ 게이트웨이 가이드의 *"serviceKey 는 일반 인증키(Decoding)을 입력"* 은
 * **Swagger-UI 입력창 기준**이다. 거기서는 UI 가 대신 인코딩해 준다. URL 을 직접
 * 만드는 이 코드와는 **반대**이니 그 문장을 그대로 옮기지 말 것.
 */
async function get(
  op: string,
  page: number,
  rows: number,
): Promise<{ items: Row[]; total: number }> {
  const key = serviceKey();
  if (!key) return { items: [], total: 0 };
  const url = `${BASE}/${op}?serviceKey=${key}&type=json&pageNo=${page}&numOfRows=${rows}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KLID ${op} ${res.status}`);
  const body = (await res.json()) as {
    body?: { totalCount?: number; items?: { item?: Row[] } };
  };
  return { items: body.body?.items?.item ?? [], total: body.body?.totalCount ?? 0 };
}

/** 실시간 표는 **한 번에 전부** 온다 (지자체 필터가 없다) — 받아서 잠깐 캐시한다 */
async function liveRows(): Promise<{ rows: Row[]; fetched: boolean }> {
  const now = Date.now();
  if (liveCache && now - liveCache.at < CACHE_TTL_MS) {
    return { rows: liveCache.rows, fetched: false };
  }
  const { items: rows } = await get("tl_drct_info", 1, PAGE_SIZE);
  liveCache = { at: now, rows };
  return { rows, fetched: true };
}

/** `stdgCd:crsrdId` ↔ 행 */
const idOf = (row: Row) => `${row.stdgCd}:${row.crsrdId}`;

/**
 * 잔여시간 — **ms 를 초로**. 값이 비면 `null`.
 *
 * ⚠️ 빈 문자열이 "0" 이 아니다. `Number("")` 는 `0` 이라 그대로 넘기면 **모든
 * 미제공 방위가 "0초 남음"** 으로 보인다
 */
function remaining(row: Row, base: string): { seconds: number; raw: number } | null {
  const raw = row[`${base}RmndCs`];
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return { seconds: Math.ceil(n / 1000), raw: n };
}

function readRow(row: Row, base: string): LiveReading {
  const stateField = `${base}SttsNm`;
  const stateRaw = row[stateField] ?? "";
  const rest = remaining(row, base);
  return {
    state: STATE[stateRaw] ?? "unknown",
    secondsRemaining: rest ? rest.seconds : null,
    detail: {
      stateField,
      stateRaw: stateRaw || null,
      remainingField: rest ? `${base}RmndCs` : undefined,
      remainingRaw: rest?.raw,
      // ⚠️ 이름은 `Cs` 지만 실측은 **ms** 다 — 사실대로 답한다 (D-317)
      unit: rest ? "ms" : undefined,
    },
  };
}

async function readLive(ref: LiveRef): Promise<LiveResult> {
  if (!serviceKey()) return { reading: null, fetched: false };
  const { rows, fetched } = await liveRows();
  const row = rows.find((r) => idOf(r) === ref.itstId);
  return { reading: row ? readRow(row, fieldBase(ref.direction, ref.kind)) : null, fetched };
}

const DIRECTIONS: Direction[] = ["nt", "ne", "et", "se", "st", "sw", "wt", "nw"];

/**
 * 그 방위·종별에 **읽을 값이 있는가**.
 *
 * ⚠️ **`undefined` 만 보면 안 된다.** 울산 교차로는 보행(`Pdsg`) 필드를 *가지고
 * 있으면서 값이 빈 문자열*이다. 존재 여부만 보던 예전 판정은 그것을 통과시켜
 * **8방위가 전부 `unknown` 인 표**를 성공 응답으로 내보냈다 — 화면은 방위 8개를
 * 나란히 띄우지만 전부 같은 상태라 **사용자가 눈앞 신호와 대조할 수가 없다.**
 * "진행이 안 된다" 로 보이는 자리가 여기였다 (2026-09-12 실측).
 */
function hasValue(row: Row, base: string): boolean {
  const state = row[`${base}SttsNm`];
  const rest = row[`${base}RmndCs`];
  return (state !== undefined && state !== "") || (rest !== undefined && rest !== "");
}

/**
 * 이 교차로가 **값을 주는 신호종별**.
 *
 * ⚠️ 같은 응답 한 행에 모든 종별이 들어 있어 **추가 호출이 들지 않는다.** 요청한
 * 종별이 비었을 때 "그럼 무엇이 되는가" 를 화면이 말할 수 있어야 유저가 다음
 * 행동을 안다 — 빈 화면은 유저에게 자기 잘못처럼 보인다.
 */
function kindsWithData(row: Row): SignalKind[] {
  return (Object.keys(KIND_CODE) as SignalKind[]).filter((kind) =>
    DIRECTIONS.some((d) => hasValue(row, fieldBase(d, kind))),
  );
}

async function readPhases(itstId: string, kind: SignalKind) {
  if (!serviceKey()) return null;
  const { rows, fetched } = await liveRows();
  const row = rows.find((r) => idOf(r) === itstId);
  if (!row) return null;
  const out: PhaseRow[] = [];
  for (const direction of DIRECTIONS) {
    const base = fieldBase(direction, kind);
    // 그 방위·종별이 아예 없는 교차로가 있다 — 빈 칸을 행으로 만들지 않는다
    if (!hasValue(row, base)) continue;
    const reading = readRow(row, base);
    out.push({
      direction,
      state: reading.state,
      secondsRemaining: reading.secondsRemaining,
      field: reading.detail.stateField,
    });
  }
  // 요청한 종별이 비어도 **이 교차로가 무엇을 주는지는 안다** — 그 사실을 넘긴다
  return out.length > 0
    ? { rows: out, fetched, kinds: kindsWithData(row) }
    : { rows: [], fetched, kinds: kindsWithData(row) };
}

async function fetchIntersections(): Promise<{ items: IntersectionRow[]; requests: number }> {
  if (!serviceKey()) return { items: [], requests: 0 };
  const items: IntersectionRow[] = [];
  let requests = 0;
  let total = Infinity;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    // ⚠️ `totalCount` 를 보고 정확히 끊는다 — 상한까지 도는 것은 호출 낭비다
    const got = await get("crsrd_map_info", page, PAGE_SIZE);
    const rows = got.items;
    if (page === 1) total = got.total || Infinity;
    requests += 1;
    for (const r of rows) {
      const lat = Number(r.mapCtptIntLat);
      const lon = Number(r.mapCtptIntLot);
      // 좌표 없는 행은 버린다 — 좌표로 찾는 것이 목적이라 쓸 수 없다
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      items.push({
        itstId: idOf(r),
        name: r.crsrdNm || idOf(r),
        engName: r.crsrdEngNm || undefined,
        lat,
        lon,
        laneWidth: r.laneWdth ? Number(r.laneWdth) : undefined,
        limitSpeed: r.lmtSpd ? Number(r.lmtSpd) : undefined,
      });
    }
    if (rows.length < PAGE_SIZE || items.length >= total) break;
  }
  return { items, requests };
}

/**
 * 커버리지 — ⚠️ **좌표 목록과 실시간의 범위가 다르다** (2026-09-11 실측).
 *
 * | 오퍼레이션 | 담긴 곳 | 건수 |
 * |---|---|---|
 * | `crsrd_map_info` (좌표) | 서울 · 제주 · 울산 | 2,779 / 1,058 / 402 = **4,239** |
 * | `tl_drct_info` (실시간) | **울산뿐** | **398** |
 *
 * 명세의 `stdgCd` 파라미터로 **직접 확인했다**: `1100000000`(서울) → `totalCount 0`,
 * `5000000000`(제주) → `0`, `3100000000`(울산) → `398`. 추측이 아니다.
 *
 * `covers()` 는 **실시간 기준**이다 — 이 함수가 답하는 질문이 "여기 신호를 실시간
 * 으로 읽을 수 있나" 이기 때문이다. 좌표 목록에 있다는 이유로 서울을 맡으면,
 * 실시간이 비었을 때 화면이 **"개방 대상이 아니다"** 대신 "신호를 못 읽음" 으로
 * 보인다 — 유저가 할 수 있는 일이 달라진다.
 *
 * ⚠️ 데이터셋 이름은 "전국 통합데이터" 지만 **이름을 믿지 않는다.** 좌표 목록은
 * `fetchIntersections` 가 범위와 무관하게 전부 내므로 서울·제주도 지도 검색에는
 * 그대로 쓰인다 — 커버리지 판정과 목록 제공은 다른 이야기다.
 */
const BOXES = [
  // 실시간(`tl_drct_info`)이 실제로 담는 곳. 개방이 늘면 여기를 넓힌다
  { name: "울산", minLat: 35.44, maxLat: 35.72, minLon: 129.0, maxLon: 129.47 },
];

export const klidRti: SignalProvider = {
  id: "klid-rti",
  label: "교통안전 신호등 실시간 정보(행안부)",
  isConfigured: () => serviceKey() !== null,
  covers: ({ lat, lon }: Coords) =>
    BOXES.some(
      (b) => lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon,
    ),
  readLive,
  readPhases,
  fetchIntersections,
};
