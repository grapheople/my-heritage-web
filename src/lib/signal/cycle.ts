/**
 * 고정주기 신호 계산 — **순수 함수**. 네트워크도 DB도 타지 않는다.
 *
 * ## 왜 계산식이 따로 있는가
 * 실시간 신호 개방(서울 C-ITS)은 **교차로 단위로 개방 여부가 다르다.** 집앞
 * 신호등이 개방 대상이 아니면 실시간 값이 영원히 오지 않는다. 그런 신호등도
 * 대부분 **고정주기**라서, 한 번 측정한 주기와 기준 시각만 있으면 초 단위로
 * 맞춘다. 그래서 이 파일이 기본이고 실시간은 그 위에 얹는 값이다.
 *
 * ## ⚠️ 여기에 시간대·요일 판정을 두는 이유
 * 첨두/비첨두 주기가 다른 신호등이 흔하다. 프로파일을 시간대별로 나눠 두지
 * 않으면 "낮에는 맞는데 밤에는 10초씩 틀린다"가 된다 — 사용자는 그걸 버그로
 * 읽지 않고 "이 API 는 부정확하다"로 읽는다.
 */

/**
 * ⚠️ `yellow` 는 실시간 값에서만 나온다. 고정주기 계산은 녹색/적색만 낸다 —
 * 황색 길이를 따로 측정하지 않았는데 추측해서 채우면 그게 곧 오차다.
 */
export type SignalState = "green" | "red" | "yellow" | "unknown";

export type CycleProfile = {
  /**
   * 기준 시각 — **이 순간에 녹색이 켜졌다.** ISO 8601, 오프셋 포함
   * (예: `2026-09-10T21:03:07+09:00`).
   *
   * ⚠️ 오프셋을 빼먹으면 서버 타임존에 따라 9시간 밀린다. 배포는 UTC 다.
   */
  greenStartAt: string;
  /** 녹색 지속 시간(초) */
  greenSec: number;
  /** 녹색이 꺼지고 다음 녹색까지(초). 황색·전적색을 모두 포함한 값이다 */
  redSec: number;
  /** 적용 시작 시각 (KST, "HH:MM"). 생략하면 종일 */
  from?: string;
  /** 적용 종료 시각 (KST, "HH:MM"). `from` 보다 작으면 자정을 넘는 구간이다 */
  to?: string;
  /** 적용 요일 (0=일 … 6=토). 생략하면 매일 */
  days?: number[];
  /** 사람이 읽을 라벨 (예: "평일 첨두") */
  label?: string;
};

export type CycleReading = {
  state: "green" | "red";
  /** 지금 상태가 끝날 때까지 남은 초 */
  secondsRemaining: number;
  /** 다음 녹색까지 남은 초. **이미 녹색이면 0** */
  nextGreenInSeconds: number;
  /** 한 주기 길이(초) */
  cycleSec: number;
  profile: CycleProfile;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/**
 * ⚠️ `hourCycle: "h23"` 을 명시한다. `hour12: false` 만 주면 ICU 버전에 따라
 * 자정이 `24` 로 나와 시간대 판정이 하루 어긋난다.
 */
const SEOUL_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  hourCycle: "h23",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** 서울 기준 요일·자정으로부터의 분 */
function seoulClock(now: Date): { day: number; minutes: number } {
  const parts = SEOUL_FORMAT.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: WEEKDAY_INDEX[get("weekday")] ?? 0,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

function inWindow(minutes: number, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  const start = from ? toMinutes(from) : 0;
  const end = to ? toMinutes(to) : 24 * 60;
  if (start === null || end === null) return false;
  // 자정을 넘는 구간 (예: 23:00~05:00) 은 부등호 방향이 뒤집힌다
  return start <= end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
}

/**
 * 지금 적용되는 프로파일. **먼저 선언된 것이 이긴다** — 좁은 구간을 앞에,
 * 종일 기본값을 뒤에 두면 의도한 대로 겹친다.
 */
export function selectProfile(
  profiles: readonly CycleProfile[],
  now: Date,
): CycleProfile | null {
  const { day, minutes } = seoulClock(now);
  return (
    profiles.find(
      (p) =>
        (!p.days || p.days.includes(day)) && inWindow(minutes, p.from, p.to),
    ) ?? null
  );
}

/** 나머지 연산 — 음수(기준 시각이 미래)에서도 주기 안으로 접는다 */
function mod(value: number, m: number): number {
  return ((value % m) + m) % m;
}

/** 설정이 깨졌으면 이유를 문장으로 낸다. 빈 배열이면 정상 */
export function validateProfile(profile: CycleProfile): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(Date.parse(profile.greenStartAt))) {
    errors.push(`greenStartAt 을 읽을 수 없다: ${profile.greenStartAt}`);
  } else if (!/[Z+]|[-]\d{2}:\d{2}$/.test(profile.greenStartAt)) {
    // 오프셋 없는 ISO 는 런타임 타임존에 따라 해석이 갈린다 (배포는 UTC)
    errors.push(`greenStartAt 에 시간대 오프셋이 없다: ${profile.greenStartAt}`);
  }
  if (!(profile.greenSec > 0)) errors.push("greenSec 은 0 보다 커야 한다");
  if (!(profile.redSec > 0)) errors.push("redSec 은 0 보다 커야 한다");
  if (profile.from && toMinutes(profile.from) === null) {
    errors.push(`from 형식이 HH:MM 이 아니다: ${profile.from}`);
  }
  if (profile.to && toMinutes(profile.to) === null) {
    errors.push(`to 형식이 HH:MM 이 아니다: ${profile.to}`);
  }
  if (profile.days?.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    errors.push("days 는 0(일)~6(토) 정수여야 한다");
  }
  return errors;
}

/**
 * 프로파일 **하나**로 지금 상태와 남은 초를 계산한다. 설정이 깨졌으면 `null`.
 *
 * ⚠️ 시간대 선택을 하지 않는다 — 동기화가 보정한 기준 시각을 끼워 넣고 다시
 * 계산할 때, 선택을 한 번 더 하면 같은 프로파일이 다시 뽑히는지에 의존하게 된다.
 * 선택과 계산을 분리해 그 의존을 없앤다.
 */
export function readProfile(
  profile: CycleProfile,
  now: Date = new Date(),
): CycleReading | null {
  if (validateProfile(profile).length > 0) return null;

  const cycleSec = profile.greenSec + profile.redSec;
  const anchor = Date.parse(profile.greenStartAt);
  const elapsed = mod((now.getTime() - anchor) / 1000, cycleSec);

  if (elapsed < profile.greenSec) {
    return {
      state: "green",
      // ⚠️ 올림이다. "0초 남음"을 내면 아직 건널 수 있는데 못 건넌다고 읽힌다
      secondsRemaining: Math.ceil(profile.greenSec - elapsed),
      nextGreenInSeconds: 0,
      cycleSec,
      profile,
    };
  }
  const remaining = Math.ceil(cycleSec - elapsed);
  return {
    state: "red",
    secondsRemaining: remaining,
    // 적색일 때는 두 값이 같다 — 클라이언트가 분기하지 않도록 둘 다 낸다
    nextGreenInSeconds: remaining,
    cycleSec,
    profile,
  };
}

/**
 * 측정한 주기로 지금 상태와 남은 초를 계산한다.
 * 적용할 프로파일이 없거나 설정이 깨졌으면 `null`.
 */
export function readCycle(
  profiles: readonly CycleProfile[],
  now: Date = new Date(),
): CycleReading | null {
  const profile = selectProfile(profiles, now);
  return profile ? readProfile(profile, now) : null;
}

/**
 * 실시간 관측 한 건에서 **기준 시각을 역산한다** (동기화용).
 *
 * 녹색이 X초 남았다면 녹색은 `now − (greenSec − X)` 에 켜졌다.
 * 적색이 X초 남았다면 다음 녹색은 `now + X` 에 켜진다 — 주기 안에서 합동이므로
 * 미래 시각을 기준으로 써도 계산은 같다(`mod` 가 접는다).
 *
 * ⚠️ **관측이 측정 주기와 모순되면 `null`.** 예를 들어 "녹색 45초 남음"인데
 * `greenSec` 이 30 이면 둘 중 하나가 틀린 것이다 — 그 값으로 기준 시각을 덮으면
 * 오차를 영구히 심는다. 그때는 보정을 거부하고 주기를 다시 재게 해야 한다.
 */
export function deriveGreenStart(args: {
  state: "green" | "red";
  secondsRemaining: number;
  profile: Pick<CycleProfile, "greenSec" | "redSec">;
  now: Date;
}): Date | null {
  const { state, secondsRemaining, profile, now } = args;
  if (secondsRemaining < 0) return null;
  if (state === "green") {
    if (secondsRemaining > profile.greenSec) return null;
    return new Date(now.getTime() - (profile.greenSec - secondsRemaining) * 1000);
  }
  if (secondsRemaining > profile.redSec) return null;
  return new Date(now.getTime() + secondsRemaining * 1000);
}

/**
 * 설정된 기준 시각이 실제보다 얼마나 어긋났는가 (초, 반올림).
 * 양수 = 설정이 실제보다 **늦다**(앞으로 당겨야 한다).
 *
 * ⚠️ **반주기 기준으로 접는다.** 주기 120초에서 119초 어긋난 것은 "119초 늦음"이
 * 아니라 "1초 빠름"이다. 접지 않으면 멀쩡한 신호등이 매번 크게 틀린 것처럼 보인다.
 */
export function driftSeconds(configured: Date, actual: Date, cycleSec: number): number {
  const half = cycleSec / 2;
  const raw = (actual.getTime() - configured.getTime()) / 1000;
  return Math.round((((raw % cycleSec) + cycleSec + half) % cycleSec) - half);
}
