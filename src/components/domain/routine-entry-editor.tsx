"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { requestExercise, searchExercises } from "@/lib/actions/exercise";
import { formatRest, type RoutineEntryInput } from "@/lib/routine-entry";
import type { Locale } from "@/i18n/routing";

/**
 * 루틴 항목 편집기 — **등록 폼과 상세가 같은 것을 쓴다** (D-236).
 *
 * ## ⚠️ 왜 공유 컴포넌트인가
 * PM 요청으로 **등록할 때** 항목을 담게 됐고, 상세에서도 담는다. 두 화면이 각자
 * 편집기를 가지면 **세트 칸의 규칙이 갈린다** — 한쪽만 빈 칸을 버리거나, 한쪽만
 * 휴식 0초를 막는 식이다. 이 저장소가 반복 확인한 실패다 (D-190·D-197·D-202).
 *
 * 그래서 이 컴포넌트는 **상태를 들고 있지 않다.** 값과 `onChange` 만 받는다
 * (제어 컴포넌트) — 등록 폼은 저장 전까지 메모리에 모으고, 상세는 변경마다 서버에
 * 보낸다. 저장 시점의 차이를 **부모가** 정한다.
 *
 * ## ⚠️ 세트별 횟수 칸이 이 화면의 핵심이다 (D-236)
 * `sets` 숫자 하나가 아니라 **칸이 세트 수만큼** 있다. 피라미드·드롭세트가
 * 그대로 표현된다 — `10 / 8 / 6`.
 *
 * ## ⚠️ 휴식은 분/초로 받는다
 * 저장은 초 하나다(`restDurationSeconds`). 분·초를 따로 저장하면 `3분 0초` 와
 * `180초` 가 다른 값으로 남아 비교·합산이 갈린다.
 */

/** 화면이 들고 있는 항목 — 서버 모양(`RoutineEntryInput`)에 표시용 정보를 얹었다 */
export type DraftEntry =
  | {
      kind: "EXERCISE";
      /** 저장된 항목이면 그 id. **등록 폼에서는 없다**(아직 저장 전이다) */
      id?: string;
      exerciseId: string;
      name: string;
      inactive?: boolean;
      reps: string[];
      restSeconds: string;
      weight: string;
      rpe: string;
      tempo: string;
      machineSetting: string;
    }
  | {
      kind: "REST";
      id?: string;
      minutes: string;
      seconds: string;
    };

/** 화면 모양 → 서버 입력 모양 */
export function toEntryInput(d: DraftEntry): RoutineEntryInput {
  return d.kind === "REST"
    ? { kind: "REST", minutes: d.minutes, seconds: d.seconds }
    : {
        kind: "EXERCISE",
        exerciseId: d.exerciseId,
        reps: d.reps,
        restSeconds: d.restSeconds,
        weight: d.weight,
        rpe: d.rpe,
        tempo: d.tempo,
        machineSetting: d.machineSetting,
      };
}

/** 기본 세트 칸 수 — 3세트가 가장 흔하다. 유저가 늘리고 줄인다 */
const DEFAULT_SETS = 3;

export function emptyExerciseDraft(exerciseId: string, name: string): DraftEntry {
  return {
    kind: "EXERCISE",
    exerciseId,
    name,
    reps: Array.from({ length: DEFAULT_SETS }, () => ""),
    restSeconds: "",
    weight: "",
    rpe: "",
    tempo: "",
    machineSetting: "",
  };
}

export function emptyRestDraft(): DraftEntry {
  // 3분이 운동 사이 휴식의 흔한 값이다. 유저가 고친다
  return { kind: "REST", minutes: "3", seconds: "0" };
}

/** 내 설정 라벨·단위 — **서버가 DB 에서 읽어 넘긴다** (D-135) */
export type FieldLabels = Record<string, { label: string; unit?: string }>;

export function RoutineEntryEditor({
  routineId,
  entries,
  onChange,
  labels,
  locale,
  disabled,
}: {
  /**
   * 검색이 "이 루틴에 이미 담긴 것"을 제외하려면 루틴 id 가 필요하다.
   * ⚠️ **등록 폼에는 아직 루틴이 없다** — 그때는 `undefined` 이고, 중복 제외는
   * 화면이 들고 있는 목록으로 한다
   */
  routineId?: string;
  entries: DraftEntry[];
  onChange: (next: DraftEntry[]) => void;
  labels: FieldLabels;
  locale: Locale;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const move = (index: number, delta: number) => {
    const next = [...entries];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const patch = (index: number, part: Partial<DraftEntry>) => {
    const next = [...entries];
    next[index] = { ...next[index], ...part } as DraftEntry;
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{t("item.routineHint")}</p>

      {entries.length === 0 ? (
        /*
          ⚠️ 항목 0개는 **정상 상태**다 (E-10-01) — 루틴을 만들기 시작한 직후 반드시
          거친다. 빈 목록을 그냥 두면 고장으로 읽힌다
        */
        <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
          {t("item.routineEmpty")}
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {entries.map((e, i) => (
            <li key={e.id ?? `draft-${i}`} className="rounded-md border">
              <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <span className="w-5 shrink-0 text-xs text-muted-foreground">{i + 1}</span>

                {e.kind === "REST" ? (
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    ⏸ {t("item.routineRest")}{" "}
                    <b className="text-foreground">
                      {formatRest(
                        (Number(e.minutes) || 0) * 60 + (Number(e.seconds) || 0),
                      )}
                    </b>
                  </span>
                ) : (
                  <>
                    <span
                      className={`min-w-0 flex-1 truncate ${e.inactive ? "text-muted-foreground line-through" : ""}`}
                      title={e.inactive ? t("item.routineInactive") : undefined}
                    >
                      {e.name}
                    </span>
                    <SetsSummary reps={e.reps} weight={e.weight} />
                  </>
                )}

                <button
                  type="button"
                  disabled={disabled || i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={t("item.routineUp")}
                  className="rounded border px-1.5 py-0.5 text-xs disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={disabled || i === entries.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={t("item.routineDown")}
                  className="rounded border px-1.5 py-0.5 text-xs disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setOpenIdx(openIdx === i ? null : i)}
                  aria-expanded={openIdx === i}
                  className="rounded border px-2 py-0.5 text-xs"
                >
                  {e.kind === "REST" ? t("item.routineRestEdit") : t("item.routineSettings")}
                </button>
                {/*
                  ⚠️ **삭제가 아니라 빼기다.** 운동 마스터는 남는다 — 어드민
                  데이터이고 다른 유저의 루틴에도 들어 있다 (`FR-10-B-07`)
                */}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(entries.filter((_, j) => j !== i))}
                  className="rounded border px-2 py-0.5 text-xs text-muted-foreground disabled:opacity-30"
                >
                  {t("item.routineRemove")}
                </button>
              </div>

              {openIdx === i &&
                (e.kind === "REST" ? (
                  <RestForm
                    minutes={e.minutes}
                    seconds={e.seconds}
                    onChange={(v) => patch(i, v)}
                  />
                ) : (
                  <ExerciseSettingsForm
                    draft={e}
                    labels={labels}
                    onChange={(v) => patch(i, v)}
                  />
                ))}
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap gap-2">
        <ExercisePicker
          routineId={routineId}
          locale={locale}
          disabled={disabled}
          // 등록 폼에는 루틴이 없으므로 **화면이 들고 있는 목록**으로 중복을 막는다
          excludeIds={entries.flatMap((e) => (e.kind === "EXERCISE" ? [e.exerciseId] : []))}
          onPick={(id, name) => onChange([...entries, emptyExerciseDraft(id, name)])}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...entries, emptyRestDraft()])}
          className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-30"
        >
          + {t("item.routineAddRest")}
        </button>
      </div>
    </div>
  );
}

/**
 * 접힌 상태 요약 — `3세트 10-8-6 · 80kg`.
 *
 * ⚠️ **전부 같은 값이면 반복하지 않는다** — `4세트 6-8` 이
 * `4세트 6-8-6-8-6-8-6-8` 보다 읽힌다.
 * ⚠️ 비어 있으면 **아무것도 렌더하지 않는다.** "설정 없음" 같은 문구를 두면 전부
 * 선택인데도(`FR-10-B-06`) 비어 있는 것이 결함처럼 읽힌다.
 */
function SetsSummary({ reps, weight }: { reps: string[]; weight: string }) {
  const t = useTranslations();
  const filled = reps.map((r) => r.trim()).filter(Boolean);
  const parts: string[] = [];
  if (filled.length > 0) {
    const same = filled.every((r) => r === filled[0]);
    parts.push(
      t("item.routineSetsShort", { n: String(filled.length) }) +
        " " +
        (same ? filled[0] : filled.join("-")),
    );
  }
  if (weight.trim()) parts.push(`${weight.trim()}kg`);
  if (parts.length === 0) return null;
  return <span className="shrink-0 text-xs text-muted-foreground">{parts.join(" · ")}</span>;
}

/** 휴식 폼 — 분/초 (D-236) */
function RestForm({
  minutes,
  seconds,
  onChange,
}: {
  minutes: string;
  seconds: string;
  onChange: (v: { minutes: string; seconds: string }) => void;
}) {
  const t = useTranslations();
  return (
    <div className="flex items-end gap-2 border-t px-2 py-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t("item.routineMinutes")}</span>
        <input
          value={minutes}
          inputMode="numeric"
          onChange={(e) => onChange({ minutes: e.target.value, seconds })}
          className="w-20 rounded-md border px-2 py-1 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t("item.routineSeconds")}</span>
        <input
          value={seconds}
          inputMode="numeric"
          onChange={(e) => onChange({ minutes, seconds: e.target.value })}
          className="w-20 rounded-md border px-2 py-1 text-sm"
        />
      </label>
    </div>
  );
}

/**
 * 운동 항목의 내 설정 — **세트별 횟수 칸**이 핵심이다 (D-236).
 *
 * ⚠️ **세트 칸을 늘리고 줄인다.** `sets` 숫자를 받으면 그 값과 칸 수가 어긋날 수
 * 있다 — 배열 길이가 세트 수라는 규칙(D-236)이 화면에서도 그대로여야 한다.
 */
function ExerciseSettingsForm({
  draft,
  labels,
  onChange,
}: {
  draft: Extract<DraftEntry, { kind: "EXERCISE" }>;
  labels: FieldLabels;
  onChange: (v: Partial<Extract<DraftEntry, { kind: "EXERCISE" }>>) => void;
}) {
  const t = useTranslations();
  const label = (key: string) => labels[key]?.label ?? key;
  const unit = (key: string) => (labels[key]?.unit ? ` (${labels[key].unit})` : "");

  const field = (
    key: "restSeconds" | "weight" | "rpe" | "tempo" | "machineSetting",
    attrKey: string,
    placeholder?: string,
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">
        {label(attrKey)}
        {unit(attrKey)}
      </span>
      <input
        value={draft[key]}
        placeholder={placeholder}
        onChange={(e) => onChange({ [key]: e.target.value })}
        className="rounded-md border px-2 py-1 text-sm"
      />
    </label>
  );

  return (
    <div className="border-t px-2 py-3">
      <p className="text-xs text-muted-foreground">{t("item.routineRepsPerSet")}</p>
      <div className="mt-1 flex flex-wrap items-end gap-2">
        {draft.reps.map((r, i) => (
          <label key={i} className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {t("item.routineSetNo", { n: String(i + 1) })}
            </span>
            <input
              value={r}
              // ⚠️ 범위·AMRAP 표기를 쓴다 — 숫자 입력으로 만들면 "6-8" 을 못 넣는다 (D-166)
              placeholder="10"
              onChange={(e) => {
                const next = [...draft.reps];
                next[i] = e.target.value;
                onChange({ reps: next });
              }}
              className="w-16 rounded-md border px-2 py-1 text-sm"
            />
          </label>
        ))}
        <button
          type="button"
          onClick={() => onChange({ reps: [...draft.reps, ""] })}
          className="rounded border px-2 py-1 text-xs"
        >
          + {t("item.routineAddSet")}
        </button>
        {draft.reps.length > 1 && (
          <button
            type="button"
            onClick={() => onChange({ reps: draft.reps.slice(0, -1) })}
            className="rounded border px-2 py-1 text-xs text-muted-foreground"
          >
            − {t("item.routineRemoveSet")}
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {field("restSeconds", "restSeconds")}
        {field("weight", "workingWeight")}
        {field("rpe", "rpe", "8.5")}
        {field("tempo", "tempo", "3-1-1-0")}
        <div className="col-span-2">{field("machineSetting", "machineSetting")}</div>
      </div>
    </div>
  );
}

/** 검색 디바운스 — 타자마다 서버를 때리지 않으면서 "입력 중 갱신"으로 느껴지는 선 */
const DEBOUNCE_MS = 250;

/**
 * 운동 고르기 — 검색 + 결과 없으면 **요청** (`FR-10-B-09·10`, `FR-11-D-01`).
 *
 * ⚠️ **첫 화면을 비우지 않는다.** 검색어가 없으면 최근 등록된 운동을 낸다 — 빈
 * 목록은 "마스터가 비었나"로 읽힌다 (E-11-01 과 구분되어야 한다).
 */
function ExercisePicker({
  routineId,
  locale,
  disabled,
  excludeIds,
  onPick,
}: {
  routineId?: string;
  locale: Locale;
  disabled?: boolean;
  excludeIds: string[];
  onPick: (exerciseId: string, name: string) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<{ id: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [requested, setRequested] = useState("");
  const [reqError, setReqError] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      const found = await searchExercises({ routineId, q, locale });
      // ⚠️ **늦게 온 응답이 최신 결과를 덮지 않게 한다.** 타자가 빠르면 순서가
      // 뒤집혀 도착하고, 그때 화면은 이전 검색어의 결과를 보여준다
      if (mine === seq.current) {
        setRows(found);
        setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, routineId, locale, open]);

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-30"
      >
        + {t("item.routineAddExercise")}
      </button>
    );
  }

  // 등록 폼에는 루틴이 없어 서버가 걸러줄 수 없다 — 화면 목록으로 막는다
  const visible = rows.filter((r) => !excludeIds.includes(r.id));

  return (
    <div className="w-full rounded-lg border p-2">
      <input
        value={q}
        autoFocus
        onChange={(e) => {
          setQ(e.target.value);
          // ⚠️ 로딩 표시는 **입력 시점**에 켠다 — effect 에서 켜면 렌더가 한 번 더 돈다
          setSearching(true);
        }}
        placeholder={t("item.routineSearch")}
        className="w-full rounded-md border px-2 py-1.5 text-sm"
      />

      {visible.length > 0 ? (
        <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
          {visible.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <button
                type="button"
                onClick={() => {
                  onPick(r.id, r.name);
                  setQ("");
                  setOpen(false);
                }}
                className="shrink-0 rounded border px-2 py-0.5 text-xs font-semibold"
              >
                {t("item.routineAddOne")}
              </button>
            </li>
          ))}
        </ul>
      ) : searching ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("common.loading")}</p>
      ) : (
        /*
          ⚠️ **결과 없음이 막다른 길이 되지 않게 한다** (`FR-10-B-10`). 여기서
          요청하지 못하면 유저는 루틴을 완성할 방법이 없고, 무엇이 부족한지도
          운영에 남지 않는다 (D-229 — 큐가 계측기다)
        */
        <div className="mt-2">
          <p className="text-xs text-muted-foreground">{t("item.routineNoResult")}</p>
          {requested ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("item.routineRequested", { name: requested })}
            </p>
          ) : (
            <button
              type="button"
              disabled={!q.trim()}
              onClick={async () => {
                setReqError("");
                const res = await requestExercise({ name: q });
                if (res.ok) setRequested(q.trim());
                else setReqError(res.fieldErrors?.name ?? res.formError ?? "");
              }}
              className="mt-1 rounded-md border px-2 py-1 text-xs disabled:opacity-30"
            >
              {t("item.routineRequest")}
            </button>
          )}
          {reqError && <p className="mt-1 text-xs text-destructive">{reqError}</p>}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-2 text-xs text-muted-foreground underline"
      >
        {t("common.close")}
      </button>
    </div>
  );
}
