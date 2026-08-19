/**
 * 루틴 항목 — 입력 파싱·검증 **단일 출처** (D-236).
 *
 * ## ⚠️ 왜 한 곳에 모으는가
 * 항목이 두 종류가 되면서 정합성 규칙이 생겼다: `EXERCISE` 면 `exerciseId` 가,
 * `REST` 면 `restDurationSeconds` 가 있어야 한다. **DB CHECK 를 쓰지 못한다** —
 * Prisma 가 CHECK 를 모델링하지 못해 다음 `migrate diff` 가 그것을 보지 못하고
 * 스키마와 DB 가 어긋난 것으로 취급될 위험이 있다.
 *
 * 그래서 **쓰기 경로를 하나로 모은다.** 등록 폼·구성 편집기·시드가 전부 이
 * 파일을 통과한다 — 규칙이 두 벌이 되면 조용히 갈린다 (D-190·D-197).
 *
 * ## ⚠️ 폼에서 오는 값은 전부 문자열이다
 * 숫자 칸도 문자열로 온다. 여기서 한 번에 바꾸고 **범위를 본다.** 상한은 정책이
 * 아니라 **오타 방어선**이다 — `1000000kg` 이 들어가면 화면이 깨지고, 그것은
 * 유저가 단위를 착각했다는 신호다.
 *
 * ## ⚠️ 휴식은 분/초로 받아 **초로 저장한다**
 * 분과 초를 따로 저장하면 `3분 0초` 와 `180초` 가 다른 값으로 남아 비교·합산이
 * 갈린다. 표시할 때 다시 나눈다 (`formatRest`).
 */

/** 세트별 횟수 한 칸의 상한 — 표기 자유도를 남기되 본문이 되지 않게 */
const REPS_MAX_LEN = 20;
/** 세트 수 상한. 99세트는 없다 — 마이그레이션의 `LEAST(sets, 99)` 와 같은 선 */
const MAX_SETS = 99;
/** 자유 텍스트 상한 — 메모가 본문이 되는 것을 막는다 */
const TEXT_MAX = 200;
/** 휴식 상한 2시간. 그보다 길면 그것은 휴식이 아니다 */
const REST_MAX_SECONDS = 7200;

/** 운동 항목 입력 — 폼이 주는 모양 (전부 문자열) */
export type ExerciseEntryInput = {
  kind: "EXERCISE";
  exerciseId: string;
  /** 세트별 횟수. 빈 칸은 버린다 — 배열 길이가 세트 수다 (D-236) */
  reps?: string[];
  /** **세트 사이** 휴식 (초) */
  restSeconds?: string;
  weight?: string;
  rpe?: string;
  tempo?: string;
  machineSetting?: string;
};

/** 휴식 항목 입력 — **운동 사이** 휴식. 분/초로 받는다 */
export type RestEntryInput = {
  kind: "REST";
  minutes?: string;
  seconds?: string;
};

export type RoutineEntryInput = ExerciseEntryInput | RestEntryInput;

/** DB 에 그대로 넣을 모양. `null` 은 "없음/지움" 이다 */
export type RoutineEntryData = {
  kind: "EXERCISE" | "REST";
  exerciseId: string | null;
  reps: string[];
  restSeconds: number | null;
  workingWeight: string | null;
  rpe: string | null;
  tempo: string | null;
  machineSetting: string | null;
  restDurationSeconds: number | null;
};

type ParseResult =
  | { ok: true; data: RoutineEntryData }
  | { ok: false; message: string };

function intField(
  raw: string | undefined,
  label: string,
  max: number,
): { ok: true; value: number | null } | { ok: false; message: string } {
  const t = raw?.trim();
  if (!t) return { ok: true, value: null };
  // ⚠️ 소수를 조용히 버리지 않는다 — 넣은 값과 저장된 값이 달라지면 화면에서 안 보인다
  if (!/^\d+$/.test(t)) return { ok: false, message: `${label}은 0 이상의 정수로 입력해주세요` };
  const n = Number(t);
  if (n > max) return { ok: false, message: `${label}이 너무 큽니다` };
  return { ok: true, value: n };
}

/**
 * 소수 허용 필드. **문자열로 그대로 넘긴다** — `Decimal` 컬럼은 문자열을 받고,
 * `Number` 를 거치면 `2.5` 같은 값이 부동소수 오차를 얻는다.
 */
function decimalField(
  raw: string | undefined,
  label: string,
  max: number,
  decimals: number,
): { ok: true; value: string | null } | { ok: false; message: string } {
  const t = raw?.trim();
  if (!t) return { ok: true, value: null };
  if (!new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(t)) {
    return { ok: false, message: `${label}은 소수점 ${decimals}자리까지의 숫자로 입력해주세요` };
  }
  if (Number(t) > max) return { ok: false, message: `${label}이 너무 큽니다` };
  return { ok: true, value: t };
}

function textField(
  raw: string | undefined,
  label: string,
): { ok: true; value: string | null } | { ok: false; message: string } {
  const t = raw?.trim();
  if (!t) return { ok: true, value: null };
  if (t.length > TEXT_MAX) return { ok: false, message: `${label}이 너무 깁니다` };
  return { ok: true, value: t };
}

/**
 * 세트별 횟수 정리.
 *
 * ⚠️ **빈 칸을 버린다.** 폼이 세트 칸을 3개 그려두고 유저가 2개만 채우면
 * `["10","8",""]` 이 온다 — 그대로 저장하면 **3세트인데 마지막이 빈** 상태가 되고,
 * 배열 길이가 세트 수라는 규칙(D-236)이 거짓말한다.
 *
 * ⚠️ **숫자로 강제하지 않는다.** 실무 표기가 범위다 ("6-8", "AMRAP", D-166).
 */
function parseReps(
  raw: string[] | undefined,
): { ok: true; value: string[] } | { ok: false; message: string } {
  const list = (raw ?? []).map((r) => r.trim()).filter(Boolean);
  if (list.length > MAX_SETS) return { ok: false, message: `세트가 너무 많습니다` };
  const tooLong = list.find((r) => r.length > REPS_MAX_LEN);
  if (tooLong) return { ok: false, message: `횟수 표기가 너무 깁니다 — "${tooLong}"` };
  return { ok: true, value: list };
}

/** 한 항목을 파싱한다. 실패하면 **이유를 돌려준다** — 조용히 버리지 않는다 */
export function parseRoutineEntry(input: RoutineEntryInput): ParseResult {
  if (input.kind === "REST") {
    const min = intField(input.minutes, "휴식 분", 120);
    if (!min.ok) return min;
    const sec = intField(input.seconds, "휴식 초", 59);
    if (!sec.ok) return sec;
    const total = (min.value ?? 0) * 60 + (sec.value ?? 0);
    /*
      ⚠️ **0초 휴식을 허용하지 않는다.** 그것은 휴식이 아니고, 목록에 `⏸ 0초` 가
      끼면 유저가 실수로 넣은 빈 칸으로 보인다. 지우라고 말해주는 편이 낫다
    */
    if (total <= 0) return { ok: false, message: "휴식 시간을 입력해주세요" };
    if (total > REST_MAX_SECONDS) return { ok: false, message: "휴식이 너무 깁니다" };
    return {
      ok: true,
      data: {
        kind: "REST",
        exerciseId: null,
        reps: [],
        restSeconds: null,
        workingWeight: null,
        rpe: null,
        tempo: null,
        machineSetting: null,
        restDurationSeconds: total,
      },
    };
  }

  if (!input.exerciseId?.trim()) return { ok: false, message: "운동을 선택해주세요" };

  const reps = parseReps(input.reps);
  if (!reps.ok) return reps;
  // 휴식 2시간(7200초)을 넘기면 그것은 세트 사이 휴식이 아니다
  const rest = intField(input.restSeconds, "세트 사이 휴식", REST_MAX_SECONDS);
  if (!rest.ok) return rest;
  // 사람이 드는 중량의 물리적 상한 밖 (kg)
  const weight = decimalField(input.weight, "중량", 1000, 2);
  if (!weight.ok) return weight;
  // RPE 는 정의상 10 이 최대다
  const rpe = decimalField(input.rpe, "RPE", 10, 1);
  if (!rpe.ok) return rpe;
  const tempo = textField(input.tempo, "템포");
  if (!tempo.ok) return tempo;
  const machine = textField(input.machineSetting, "머신 세팅");
  if (!machine.ok) return machine;

  return {
    ok: true,
    data: {
      kind: "EXERCISE",
      exerciseId: input.exerciseId.trim(),
      reps: reps.value,
      restSeconds: rest.value,
      workingWeight: weight.value,
      rpe: rpe.value,
      tempo: tempo.value,
      machineSetting: machine.value,
      restDurationSeconds: null,
    },
  };
}

/**
 * 휴식 초 → **분/초 표시** (D-236).
 *
 * ⚠️ 저장은 초 하나다. 표시에서만 나눈다 — 분·초를 따로 저장하면 같은 길이가 두
 * 값으로 남는다.
 *
 * `180 → "3분"` · `90 → "1분 30초"` · `45 → "45초"`
 */
export function formatRest(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}초`;
  if (s === 0) return `${m}분`;
  return `${m}분 ${s}초`;
}

/** 분/초로 나눈 값 — 편집 폼의 초기값에 쓴다 */
export function splitRest(seconds: number): { minutes: string; seconds: string } {
  return {
    minutes: String(Math.floor(seconds / 60)),
    seconds: String(seconds % 60),
  };
}

/**
 * 세트별 횟수 요약 — `3세트 10-8-6` (D-236).
 *
 * ⚠️ **전부 같은 값이면 반복하지 않는다** — `4세트 6-8` 이 `4세트 6-8-6-8-6-8-6-8`
 * 보다 읽힌다. 다를 때만 세트별로 낸다.
 */
export function summarizeReps(reps: readonly string[]): string | null {
  if (reps.length === 0) return null;
  const same = reps.every((r) => r === reps[0]);
  return same ? `${reps.length}세트 ${reps[0]}` : `${reps.length}세트 ${reps.join("-")}`;
}
