import type { SignalState } from "../cycle";
import type { Direction, LiveRef, SignalKind } from "../lights";

/**
 * 신호 정보 **제공자** 계약 (D-317).
 *
 * ## ⚠️ 왜 나눴나 — 제공자마다 **주는 것이 다르다**
 * 하나의 API 로 전국이 풀리지 않는다. 실측으로 확인한 바로는:
 *
 * | 제공자 | 커버리지 | 주는 것 |
 * |---|---|---|
 * | 서울 T-Data | **서울시** | **실시간 잔여시간** (`…RmdrCs`) |
 * | 경찰청·도로교통공단 | 지역별 개방 | 대체로 **계획정보(TOD)** — 현시 *길이* |
 * | (없음) | 어디든 | 화면에서 **직접 측정** (3번 누르기) |
 *
 * 그래서 인터페이스가 **능력별 선택 구현**이다. "모두 구현해야 하는 하나의
 * 인터페이스" 로 만들면 실시간이 없는 제공자가 억지로 `readLive` 를 갖고
 * `null` 을 뱉게 된다 — 호출부는 그것이 "지원 안 함" 인지 "지금 값이 없음" 인지
 * 구분할 수 없다.
 *
 * ## ⚠️ 커버리지를 제공자가 스스로 답한다
 * 서울 API 에 용인 좌표를 물어도 **빈 결과가 올 뿐 에러가 아니다** — 화면에는
 * "교차로 없음" 으로 보여 유저가 자기 위치 문제로 오해한다. `covers()` 로 미리
 * 갈라 **"이 지역은 이 제공자가 다루지 않는다"** 를 말할 수 있게 한다.
 */

/** 한 방위·종별의 현재 읽음 */
export type LiveReading = {
  state: SignalState;
  secondsRemaining: number | null;
  /** 어느 필드를 어떻게 읽었는지 — 추측이 섞이면 화면이 그 사실을 드러내야 한다 */
  detail: {
    stateField: string;
    stateRaw: string | number | null;
    remainingField?: string;
    remainingRaw?: number;
    /**
     * 실제로 적용한 단위. ⚠️ **필드 이름이 아니라 실측 기준이다** — 행안부
     * API 는 이름이 `…Cs` 인데 값은 밀리초다 (D-317)
     */
    unit?: "s" | "ds" | "cs" | "ms";
  };
};

/** `fetched` 는 **포털을 실제로 불렀는가** — 하루 한도 집계가 이 값을 쓴다 */
export type LiveResult = { reading: LiveReading | null; fetched: boolean };

export type PhaseRow = {
  direction: Direction;
  state: SignalState;
  secondsRemaining: number | null;
  field: string;
};

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
 * 계획정보(TOD)에서 얻은 **현시 길이**.
 *
 * ⚠️ 실시간이 아니다 — 기준 시각(언제 초록이 시작했나)은 여전히 화면에서
 * 맞춰야 한다. 그래도 **3번 누르는 측정을 대신**할 수 있어 값이 크다.
 */
export type CyclePlan = {
  greenSec: number;
  redSec: number;
  /** 이 계획이 적용되는 시간대 — TOD 는 시간대별로 다르다 */
  fromMinuteOfDay?: number;
  toMinuteOfDay?: number;
};

export type Coords = { lat: number; lon: number };

export type SignalProvider = {
  id: string;
  /** 어드민·오류 문구에 그대로 쓴다 (ko) */
  label: string;
  /** 인증키 등 설정이 갖춰졌는가 */
  isConfigured(): boolean;
  /**
   * 이 좌표를 이 제공자가 다루는가.
   *
   * ⚠️ **모르면 `true` 를 내지 않는다.** 억지로 맡으면 빈 결과가 "없음" 으로
   * 보이고 유저는 무엇이 문제인지 알 수 없다 (위 주석 참조)
   */
  covers(coords: Coords): boolean;

  /* ── 능력별 선택 구현 ── */
  /** 실시간 1건 */
  readLive?(ref: LiveRef): Promise<LiveResult>;
  /** 한 교차로의 8방위 현시 — 방위를 고를 때 눈앞 신호와 대조한다 */
  readPhases?(
    itstId: string,
    kind: SignalKind,
  ): Promise<{ rows: PhaseRow[]; fetched: boolean } | null>;
  /** 교차로 목록 (좌표로 찾기 위한 재료) */
  fetchIntersections?(): Promise<{ items: IntersectionRow[]; requests: number }>;
  /** 계획정보(TOD) — 현시 길이 */
  readPlan?(itstId: string, kind: SignalKind): Promise<CyclePlan | null>;
};
