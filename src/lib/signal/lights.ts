import type { CycleProfile } from "./cycle";
import { validateProfile } from "./cycle";

/**
 * 신호등 등록부.
 *
 * ## ⚠️ 값은 **측정해서** 넣는다
 * 아래 기본값은 형태를 보여주는 예시다(`calibrated: false`). 스톱워치로 세 개만
 * 재면 된다: ① 녹색이 켜진 순간의 시각(초까지) ② 녹색 지속 시간 ③ 녹색 시작에서
 * 다음 녹색 시작까지(= 주기). `redSec = 주기 − greenSec` 이다.
 *
 * 측정하지 않은 채로 응답을 내보내면 그럴듯한 숫자가 나오는데 그게 제일 나쁘다 —
 * 그래서 `calibrated` 를 응답에 그대로 노출한다.
 *
 * ## 배포 환경에서 코드 수정 없이 바꾸기
 * `SIGNAL_LIGHTS_JSON` 에 같은 구조의 JSON 배열을 넣으면 **이 파일을 완전히
 * 대체한다.** 주기를 재측정할 때마다 배포하지 않아도 된다.
 */

/** T-Data 필드 접두 — 8방위 (북/동/남/서/북동/남동/남서/북서) */
export type Direction = "nt" | "et" | "st" | "wt" | "ne" | "se" | "sw" | "nw";

/** T-Data 신호 종류 */
export type SignalKind =
  | "straight"
  | "left"
  | "uturn"
  | "pedestrian"
  | "bus"
  | "bicycle";

export type LiveRef = {
  /** 서울 T-Data 교차로 ID (`itstId`) */
  itstId: string;
  /** 내가 보는 신호등이 붙은 방위 */
  direction: Direction;
  /** 횡단보도면 `pedestrian` */
  kind: SignalKind;
};

export type SignalLight = {
  /** URL 에 쓰는 키 — `/api/signal?id=home` */
  id: string;
  name: string;
  /** 실시간 개방 대상일 때만. 없으면 항상 주기 계산으로 답한다 */
  live?: LiveRef;
  /** 시간대별 주기. 좁은 구간을 앞에, 종일 기본값을 뒤에 */
  cycle?: CycleProfile[];
  /**
   * 실제로 측정한 값인가. `false` 면 응답에 경고가 붙는다.
   * ⚠️ 측정값으로 바꿀 때 이 플래그도 같이 바꿔야 한다.
   */
  calibrated?: boolean;
};

const DEFAULT_LIGHTS: SignalLight[] = [
  {
    id: "home",
    name: "집앞 횡단보도",
    calibrated: false,
    cycle: [
      {
        label: "예시 — 측정값으로 바꿔야 한다",
        greenStartAt: "2026-09-10T21:00:00+09:00",
        greenSec: 30,
        redSec: 90,
      },
    ],
    // live: { itstId: "...", direction: "nt", kind: "pedestrian" },
  },
];

/**
 * ⚠️ 구조가 어긋난 항목은 **버리고 이유를 로그로 남긴다.** 던지면 라우트가
 * 500 이 되어 "환경변수 오타 하나로 API 전체가 죽는다".
 */
function parseFromEnv(raw: string): SignalLight[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("[signal] SIGNAL_LIGHTS_JSON 이 JSON 이 아니다 — 기본값을 쓴다");
    return null;
  }
  if (!Array.isArray(parsed)) {
    console.error("[signal] SIGNAL_LIGHTS_JSON 은 배열이어야 한다 — 기본값을 쓴다");
    return null;
  }

  const lights: SignalLight[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || !e.id.trim()) {
      console.error("[signal] id 가 없는 항목을 건너뛴다");
      continue;
    }
    const cycle = Array.isArray(e.cycle) ? (e.cycle as CycleProfile[]) : undefined;
    const badProfile = cycle?.flatMap((p) => validateProfile(p)) ?? [];
    if (badProfile.length > 0) {
      console.error(`[signal] ${e.id} 주기 설정이 잘못됐다: ${badProfile.join(", ")}`);
      continue;
    }
    const live =
      typeof e.live === "object" && e.live !== null
        ? (e.live as LiveRef)
        : undefined;
    if (live && (!live.itstId || !live.direction || !live.kind)) {
      console.error(`[signal] ${e.id} live 설정에 itstId·direction·kind 가 모두 필요하다`);
      continue;
    }
    if (!cycle?.length && !live) {
      console.error(`[signal] ${e.id} 는 cycle 도 live 도 없다 — 답할 근거가 없다`);
      continue;
    }
    lights.push({
      id: e.id,
      name: typeof e.name === "string" ? e.name : e.id,
      live,
      cycle,
      calibrated: e.calibrated === true,
    });
  }
  return lights.length > 0 ? lights : null;
}

export function getLights(): SignalLight[] {
  const raw = process.env.SIGNAL_LIGHTS_JSON?.trim();
  return (raw && parseFromEnv(raw)) || DEFAULT_LIGHTS;
}
