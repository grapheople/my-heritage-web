import { readCalibration, type EffectiveCalibration } from "./calibration";
import { readProfile, selectProfile, type CycleProfile, type SignalState } from "./cycle";
import type { SignalLight } from "./lights";

/**
 * 신호등 상태 판정 — **외부 API 를 부르지 않는다.**
 *
 * 설정된 주기 + 보정 이력(수동 측정 / 실시간 동기화)으로만 계산한다. 실시간 조회는
 * `POST /api/signal/sync` 에서만 일어난다 — 서울 T-Data 가 하루 1,000건이라
 * 상시 폴링에 쓸 수 없기 때문이다.
 *
 * ⚠️ 이 판단은 아직 기획 레포의 결정(D-xxx)으로 기록돼 있지 않다.
 *
 * ## 정확도의 출처
 * `POST /api/signal/measure` 로 사람이 3번 누르면 **녹색 길이·적색 길이·기준
 * 시각이 모두** 측정값으로 바뀐다. 실시간 동기화는 그 뒤 기준 시각만 다시
 * 맞춘다 — 관측 한 건으로는 주기 길이를 알 수 없기 때문이다.
 */
export type SignalAnswer = {
  id: string;
  name: string;
  state: SignalState;
  /** 지금 상태가 끝날 때까지 남은 초 */
  secondsRemaining: number;
  /** 다음 녹색까지 남은 초. **이미 녹색이면 0** */
  nextGreenInSeconds: number;
  /** 다음 녹색 시각 (ISO). 이미 녹색이면 null */
  nextGreenAt: string | null;
  source: "cycle";
  cycleSec: number;
  /**
   * 클라이언트가 **더 이상 요청하지 않고 스스로 초를 세기 위한** 값.
   * 보정이 적용된 **유효 주기**다.
   *
   * ## ⚠️ 왜 남은 초만 주지 않는가
   * 남은 초만 주면 화면은 1초마다(또는 몇 초마다) 다시 물어야 한다. 이 API 는
   * 외부 쿼터를 쓰지 않지만 그래도 요청마다 DB 를 한 번 본다 — 화면 하나를
   * 켜두는 것만으로 하루 수만 건이 된다. 주기 원본을 주면 **한 번 받아서 끝**이고,
   * `asOf` 로 시계 차이도 보정할 수 있다.
   */
  cycle: { greenStartAt: string; greenSec: number; redSec: number };
  /** 적용된 주기 프로파일 라벨 */
  profile?: string;
  /** **설정 파일**이 실측값인가 (`lights.ts` 의 `calibrated`) */
  calibrated: boolean;
  /** 마지막 기준 시각 보정. 한 번도 없으면 null */
  calibration: { syncedAt: string; driftSec: number; source: "LIVE" | "MANUAL" } | null;
  /** 사람이 직접 잰 주기 길이. 있으면 설정의 예시값과 무관하게 실측이다 */
  measured: { greenSec: number; redSec: number; measuredAt: string } | null;
  asOf: string;
  warnings: string[];
};

export type SignalFailure = { error: string; hint: string };

export function isFailure(result: SignalAnswer | SignalFailure): result is SignalFailure {
  return "error" in result;
}

/**
 * 설정 프로파일 + 보정 이력 → **실제로 계산에 쓰는 프로파일**.
 *
 * ⚠️ 조회 경로와 동기화·측정 경로가 **같은 함수**를 쓴다. 동기화가 기준 시각을
 * 역산할 때 설정의 옛 길이를 쓰면, 수동 측정으로 길이를 고친 뒤의 동기화가
 * 조용히 어긋난 기준 시각을 심는다.
 */
export function effectiveProfile(
  configured: CycleProfile,
  calibration: EffectiveCalibration,
): CycleProfile {
  return {
    ...configured,
    greenStartAt: calibration.anchor?.greenStartAt.toISOString() ?? configured.greenStartAt,
    greenSec: calibration.lengths?.greenSec ?? configured.greenSec,
    redSec: calibration.lengths?.redSec ?? configured.redSec,
  };
}

/** 지금 적용되는 설정 프로파일 + 보정. 라우트들이 공유한다 */
export async function loadProfile(
  light: SignalLight,
  now: Date,
): Promise<
  | { ok: true; configured: CycleProfile; profile: CycleProfile; calibration: EffectiveCalibration }
  | { ok: false; failure: SignalFailure }
> {
  if (!light.cycle?.length) {
    return {
      ok: false,
      failure: {
        error: "이 신호등에는 주기가 설정돼 있지 않다",
        hint: "lights.ts 또는 SIGNAL_LIGHTS_JSON 에 cycle 을 넣어라 (녹색 시작 시각·녹색 길이·주기)",
      },
    };
  }
  const configured = selectProfile(light.cycle, now);
  if (!configured) {
    return {
      ok: false,
      failure: {
        error: "지금 시각에 적용되는 주기 프로파일이 없다",
        hint: "프로파일의 from·to·days 를 확인하라. 종일 기본값을 마지막에 하나 두면 이 구멍이 막힌다",
      },
    };
  }
  const calibration = await readCalibration(light.id, configured.label ?? null);
  return { ok: true, configured, profile: effectiveProfile(configured, calibration), calibration };
}

export async function resolveSignal(
  light: SignalLight,
  now: Date = new Date(),
): Promise<SignalAnswer | SignalFailure> {
  const loaded = await loadProfile(light, now);
  if (!loaded.ok) return loaded.failure;

  const { configured, profile, calibration } = loaded;
  const reading = readProfile(profile, now);
  if (!reading) {
    return {
      error: "주기 설정이 잘못됐다",
      hint: "greenStartAt 에 오프셋(+09:00)이 있는지, greenSec·redSec 이 0 보다 큰지 확인하라",
    };
  }

  const warnings: string[] = [];
  // 사람이 직접 잰 값이 있으면 설정의 예시값은 더 이상 쓰이지 않는다
  if (light.calibrated !== true && !calibration.lengths) {
    warnings.push("측정값이 아니라 예시 주기다 — 화면에서 3번 눌러 측정하거나 lights.ts 를 실제 측정값으로 바꿔라");
  }
  if (!calibration.anchor) {
    warnings.push("아직 기준 시각을 맞춘 적이 없다 — 화면의 측정 버튼 또는 POST /api/signal/sync 로 맞추면 정확해진다");
  }

  return {
    id: light.id,
    name: light.name,
    state: reading.state,
    secondsRemaining: reading.secondsRemaining,
    nextGreenInSeconds: reading.nextGreenInSeconds,
    nextGreenAt:
      reading.nextGreenInSeconds > 0
        ? new Date(now.getTime() + reading.nextGreenInSeconds * 1000).toISOString()
        : null,
    source: "cycle",
    cycleSec: reading.cycleSec,
    cycle: {
      greenStartAt: profile.greenStartAt,
      greenSec: profile.greenSec,
      redSec: profile.redSec,
    },
    profile: configured.label,
    calibrated: light.calibrated === true,
    calibration: calibration.anchor
      ? {
          syncedAt: calibration.anchor.createdAt.toISOString(),
          driftSec: calibration.anchor.driftSec,
          source: calibration.anchor.source,
        }
      : null,
    measured: calibration.lengths
      ? {
          greenSec: calibration.lengths.greenSec,
          redSec: calibration.lengths.redSec,
          measuredAt: calibration.lengths.measuredAt.toISOString(),
        }
      : null,
    asOf: now.toISOString(),
    warnings,
  };
}
