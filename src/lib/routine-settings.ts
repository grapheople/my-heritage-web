/**
 * 루틴 안 한 운동에 대한 **내 설정** 파싱·검증 (D-227 `FR-10-B-04·06`).
 *
 * ## ⚠️ 폼에서 오는 값은 전부 문자열이다
 * 서버 액션이 `FormData` 를 받거나 클라이언트가 입력값을 그대로 보내므로 숫자
 * 필드도 문자열로 온다. 여기서 한 번에 숫자로 바꾸고 **범위를 본다.**
 *
 * ## ⚠️ 빈 문자열은 "지움"이다
 * 7종 전부 선택이므로(`FR-10-B-06`) 유저가 칸을 비우는 것이 정상 동작이다.
 * 빈 값을 무시하면 **한번 넣은 값을 지울 방법이 없어진다** — `null` 로 저장한다.
 *
 * ## ⚠️ `reps` 는 숫자로 만들지 않는다
 * 실무 표기가 범위다 ("6-8", "AMRAP"). 숫자로 강제하면 그 표기를 못 쓴다 (D-166).
 *
 * ## ⚠️ 상한을 두는 이유는 오타 방어다
 * `workingWeight` 에 `1000000` 이 들어가면 화면이 깨지고, 그것은 유저가 단위를
 * 착각했다는 신호다. 막고 이유를 말해주는 것이 조용히 저장하는 것보다 낫다.
 * 상한값 자체는 정책이 아니라 **물리적으로 불가능한 선**에서 잡았다.
 */

/** 폼에서 오는 모양 — 전부 문자열이고 전부 선택이다 */
export type RoutineSettingsInput = {
  sets?: string;
  reps?: string;
  restSeconds?: string;
  weight?: string;
  rpe?: string;
  tempo?: string;
  machineSetting?: string;
};

/** DB 에 그대로 넣을 모양. `null` 은 "지움" 이다 */
type RoutineSettingsData = {
  sets: number | null;
  repsPerSet: string | null;
  restSeconds: number | null;
  workingWeight: string | null;
  rpe: string | null;
  tempo: string | null;
  machineSetting: string | null;
};

type ParseResult =
  | { ok: true; data: RoutineSettingsData }
  | { ok: false; message: string };

/** 자유 텍스트 상한 — 메모가 본문이 되는 것을 막는다 */
const TEXT_MAX = 200;

/**
 * 정수 필드. 소수를 넣으면 **거부한다** — 조용히 버림하면 유저가 넣은 값과
 * 저장된 값이 달라지고, 그 차이는 화면에서 드러나지 않는다.
 */
function intField(
  raw: string | undefined,
  label: string,
  max: number,
): { ok: true; value: number | null } | { ok: false; message: string } {
  const t = raw?.trim();
  if (!t) return { ok: true, value: null };
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
    return {
      ok: false,
      message: `${label}은 소수점 ${decimals}자리까지의 숫자로 입력해주세요`,
    };
  }
  if (Number(t) > max) return { ok: false, message: `${label}이 너무 큽니다` };
  return { ok: true, value: t };
}

/** 자유 텍스트. 빈 값은 `null`, 길면 거부한다 */
function textField(
  raw: string | undefined,
  label: string,
): { ok: true; value: string | null } | { ok: false; message: string } {
  const t = raw?.trim();
  if (!t) return { ok: true, value: null };
  if (t.length > TEXT_MAX) return { ok: false, message: `${label}이 너무 깁니다` };
  return { ok: true, value: t };
}

export function parseRoutineSettings(input: RoutineSettingsInput | undefined): ParseResult {
  const s = input ?? {};

  // 999 세트는 없다. 오타 방어선이다
  const sets = intField(s.sets, "세트", 999);
  if (!sets.ok) return sets;
  // 휴식 2시간(7200초)을 넘기면 그것은 휴식이 아니다
  const rest = intField(s.restSeconds, "휴식 시간", 7200);
  if (!rest.ok) return rest;
  // 사람이 드는 중량의 물리적 상한 밖 (kg)
  const weight = decimalField(s.weight, "중량", 1000, 2);
  if (!weight.ok) return weight;
  // RPE 는 정의상 10 이 최대다
  const rpe = decimalField(s.rpe, "RPE", 10, 1);
  if (!rpe.ok) return rpe;

  const reps = textField(s.reps, "횟수");
  if (!reps.ok) return reps;
  const tempo = textField(s.tempo, "템포");
  if (!tempo.ok) return tempo;
  const machine = textField(s.machineSetting, "머신 세팅");
  if (!machine.ok) return machine;

  return {
    ok: true,
    data: {
      sets: sets.value,
      repsPerSet: reps.value,
      restSeconds: rest.value,
      workingWeight: weight.value,
      rpe: rpe.value,
      tempo: tempo.value,
      machineSetting: machine.value,
    },
  };
}
