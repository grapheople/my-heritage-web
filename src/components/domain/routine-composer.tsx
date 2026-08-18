"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  attachExercise,
  detachExercise,
  reorderExercises,
  updateRoutineExercise,
} from "@/lib/actions/item";
import { requestExercise, searchExercises } from "@/lib/actions/exercise";
import type { RoutineSettings } from "@/lib/data/types";
import type { Locale } from "@/i18n/routing";

/**
 * 루틴 구성 편집 — 운동 **담기 · 빼기 · 순서 · 내 설정** (D-227, `FR-10-B-02~10`).
 *
 * ## ⚠️ D-221 의 화면과 다르다 — 고르는 대상이 내 아이템이 아니다
 * 전에는 "내 종목 목록"을 `select` 로 골랐다. 지금 운동은 **어드민 마스터**라
 * 수백 건이 될 수 있어 **전부 내려보낼 수 없다** — 입력에 따라 서버에 묻는다
 * (`FR-10-B-09`). 결과가 없으면 **요청 진입점**을 낸다 (`FR-10-B-10`).
 *
 * ## ⚠️ 내 설정은 이 화면에서만 고친다
 * 세트·중량은 `(루틴, 운동)` 쌍의 값이다 (`FR-10-B-05`). 아이템 수정 폼에 두면
 * 어느 루틴의 값인지 지목할 수 없다 — 그래서 행마다 펼치는 폼을 둔다.
 *
 * ## ⚠️ 순서를 낙관적으로 먼저 바꾼다
 * 위/아래로 옮길 때마다 서버 왕복을 기다리면 목록이 **한 칸씩 늦게** 움직여
 * 유저가 두 번 누른다. 화면에서 먼저 바꾸고 서버에 보낸다 — 실패하면
 * `router.refresh()` 가 서버 상태로 되돌린다.
 *
 * ## ⚠️ 비활성 운동은 빼지 않고 흐리게 둔다 (`FR-10-B-08`)
 * 어드민이 중복 정리로 내린 운동이 유저 루틴에서 조용히 사라지면 **유저가 만든
 * 순서가 깨진다.** 표시만 흐리게 하고 유지한다.
 */

type Row = {
  id: string;
  name: string;
  muscles: string[];
  codexId: string;
  inactive: boolean;
  settings: RoutineSettings;
};

/** 검색 디바운스 — 타자마다 서버를 때리지 않으면서 "입력 중 갱신"으로 느껴지는 선 */
const DEBOUNCE_MS = 250;

export type FieldLabels = Record<string, { label: string; unit?: string }>;

export function RoutineComposer({
  routineId,
  exercises,
  locale,
  labels,
}: {
  routineId: string;
  /** 현재 구성. **순서가 곧 내용**이다 */
  exercises: Row[];
  locale: Locale;
  /**
   * 내 설정 7종의 라벨·단위. **서버가 DB 에서 읽어 넘긴다** (D-135) — 메시지
   * 파일에 박으면 어드민이 A-02 에서 이름을 바꿨을 때 여기만 옛 이름으로 남는다
   */
  labels: FieldLabels;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [rows, setRows] = useState(exercises);
  const [openId, setOpenId] = useState<string | null>(null);

  /*
    서버가 새 값을 주면 낙관적 상태를 버린다 — 다른 기기의 변경이 반영된다.

    ⚠️ **effect 가 아니라 렌더 중에 맞춘다.** effect 에서 `setState` 하면 한 번
    더 렌더되고(cascading render) 그 사이 **낡은 목록이 한 프레임 보인다**.
    props 가 바뀔 때 state 를 조정하는 React 권장 형태다.
  */
  const [seen, setSeen] = useState(exercises);
  if (seen !== exercises) {
    setSeen(exercises);
    setRows(exercises);
  }

  function run(fn: () => Promise<{ ok: boolean; formError?: string }>) {
    setError("");
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.formError ?? t("item.routineFailed"));
      // 성공·실패 모두 서버 상태로 맞춘다 — 낙관적 변경이 어긋나면 여기서 복구된다
      router.refresh();
    });
  }

  function move(index: number, delta: number) {
    const next = [...rows];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next); // 낙관적 — 위 주석 참조
    run(() => reorderExercises({ routineId, exerciseIds: next.map((r) => r.id) }));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{t("item.routineHint")}</p>

      {rows.length === 0 ? (
        /*
          ⚠️ 운동 0개는 **정상 상태**다 (E-10-01) — 루틴을 만든 직후 반드시
          거친다. 빈 목록을 그냥 두면 고장으로 읽힌다
        */
        <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
          {t("item.routineEmpty")}
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {rows.map((e, i) => (
            <li key={e.id} className="rounded-md border">
              <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <span className="w-5 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                <span
                  className={`min-w-0 flex-1 truncate ${e.inactive ? "text-muted-foreground line-through" : ""}`}
                  // 비활성은 취소선으로 드러낸다 — 사라지지 않았다는 것도 함께 말한다
                  title={e.inactive ? t("item.routineInactive") : undefined}
                >
                  {e.name}
                </span>
                <SettingsSummary settings={e.settings} />
                <button
                  type="button"
                  disabled={pending || i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={t("item.routineUp")}
                  className="rounded border px-1.5 py-0.5 text-xs disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={pending || i === rows.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={t("item.routineDown")}
                  className="rounded border px-1.5 py-0.5 text-xs disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setOpenId(openId === e.id ? null : e.id)}
                  className="rounded border px-2 py-0.5 text-xs"
                  aria-expanded={openId === e.id}
                >
                  {t("item.routineSettings")}
                </button>
                {/*
                  ⚠️ **삭제가 아니라 빼기다.** 운동 마스터는 남는다 —
                  어드민 데이터이고 다른 유저의 루틴에도 들어 있다 (`FR-10-B-07`)
                */}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setRows(rows.filter((r) => r.id !== e.id));
                    run(() => detachExercise({ routineId, exerciseId: e.id }));
                  }}
                  className="rounded border px-2 py-0.5 text-xs text-muted-foreground disabled:opacity-30"
                >
                  {t("item.routineRemove")}
                </button>
              </div>

              {openId === e.id && (
                <SettingsForm
                  initial={e.settings}
                  labels={labels}
                  pending={pending}
                  onSave={(settings) => {
                    run(() => updateRoutineExercise({ routineId, exerciseId: e.id, settings }));
                  }}
                />
              )}
            </li>
          ))}
        </ol>
      )}

      <ExercisePicker
        routineId={routineId}
        locale={locale}
        pending={pending}
        onPick={(exerciseId) => run(() => attachExercise({ routineId, exerciseId }))}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * 접힌 상태에서도 **핵심 설정을 보여준다** — 4세트 6-8회 100kg.
 *
 * ⚠️ 전부 비어 있으면 **아무것도 렌더하지 않는다.** "설정 없음" 같은 문구를 두면
 * 7종이 다 선택인데도(`FR-10-B-06`) 비어 있는 것이 결함처럼 읽힌다.
 */
function SettingsSummary({ settings }: { settings: RoutineSettings }) {
  const t = useTranslations();
  const parts: string[] = [];
  if (settings.sets) parts.push(t("item.routineSetsShort", { n: settings.sets }));
  if (settings.reps) parts.push(settings.reps);
  if (settings.weight) parts.push(`${settings.weight}kg`);
  if (parts.length === 0) return null;
  return (
    <span className="shrink-0 text-xs text-muted-foreground">{parts.join(" · ")}</span>
  );
}

/** 내 설정 7종 폼. **빈 칸은 지움이다** (`FR-10-B-06`) */
function SettingsForm({
  initial,
  labels,
  pending,
  onSave,
}: {
  initial: RoutineSettings;
  labels: FieldLabels;
  pending: boolean;
  onSave: (s: RoutineSettings) => void;
}) {
  const t = useTranslations();
  const [v, setV] = useState<RoutineSettings>(initial);

  const field = (
    key: keyof RoutineSettings,
    /** `AttributeDefinition.key` — 라벨·단위를 여기서 찾는다 */
    attrKey: string,
    placeholder?: string,
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">
        {labels[attrKey]?.label ?? attrKey}
        {/* ⚠️ 단위가 없으면 "휴식: 180" 이 초인지 분인지 알 수 없다 (D-166) */}
        {labels[attrKey]?.unit ? ` (${labels[attrKey].unit})` : ""}
      </span>
      <input
        value={v[key] ?? ""}
        placeholder={placeholder}
        onChange={(e) => setV({ ...v, [key]: e.target.value })}
        className="rounded-md border px-2 py-1 text-sm"
      />
    </label>
  );

  return (
    <div className="border-t px-2 py-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {field("sets", "sets")}
        {/* ⚠️ 범위 표기를 쓴다 — 숫자 입력으로 만들면 "6-8" 을 못 넣는다 (D-166) */}
        {field("reps", "repsPerSet", "6-8")}
        {field("restSeconds", "restSeconds")}
        {field("weight", "workingWeight")}
        {field("rpe", "rpe", "8.5")}
        {field("tempo", "tempo", "3-1-1-0")}
        <div className="col-span-2">{field("machineSetting", "machineSetting")}</div>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => onSave(v)}
        className="mt-2 rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-30"
      >
        {t("item.routineSettingsSave")}
      </button>
    </div>
  );
}

/**
 * 운동 고르기 — 검색 + 결과 없으면 **요청** (`FR-10-B-09·10`, `FR-11-D-01`).
 *
 * ⚠️ **첫 화면을 비우지 않는다.** 검색어가 없으면 최근 등록된 운동을 낸다 —
 * 빈 목록은 "마스터가 비었나"로 읽힌다 (E-11-01 과 구분되어야 한다).
 */
function ExercisePicker({
  routineId,
  locale,
  pending,
  onPick,
}: {
  routineId: string;
  locale: Locale;
  pending: boolean;
  onPick: (exerciseId: string) => void;
}) {
  const t = useTranslations();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string; muscles: string[]; codexId: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [requested, setRequested] = useState("");
  const [reqError, setReqError] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      const rows = await searchExercises({ routineId, q, locale });
      // ⚠️ **늦게 온 응답이 최신 결과를 덮지 않게 한다.** 타자가 빠르면 순서가
      // 뒤집혀 도착하고, 그때 화면은 이전 검색어의 결과를 보여준다
      if (mine === seq.current) {
        setResults(rows);
        setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, routineId, locale]);

  return (
    <div className="rounded-lg border p-2">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          // ⚠️ 로딩 표시는 **입력 시점**에 켠다 — effect 에서 켜면 렌더가 한 번 더 돈다
          setSearching(true);
        }}
        placeholder={t("item.routineSearch")}
        className="w-full rounded-md border px-2 py-1.5 text-sm"
      />

      {results.length > 0 ? (
        <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
          {results.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => onPick(r.id)}
                className="shrink-0 rounded border px-2 py-0.5 text-xs font-semibold disabled:opacity-30"
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
              disabled={pending || !q.trim()}
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
    </div>
  );
}
