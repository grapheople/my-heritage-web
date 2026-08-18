"use client";

import { useState, useTransition } from "react";
import {
  createExercise,
  createExercisesFromResearch,
  researchExerciseCandidates,
  updateExercise,
} from "@/lib/actions/admin-exercise";

/**
 * A-17 운동 마스터 폼 3종 (D-227·D-232).
 *
 * | 폼 | 결과 검증 상태 | 근거 |
 * |---|---|---|
 * | 직접 등록 | **검증됨** | 사람이 확인해 넣었다 (`codex` FR-04-A-02) |
 * | AI 수집 등록 | **미검증** | A-05 검수 대기 (`FR-11-B-04`, D-185) |
 * | 수정 | 그대로 | 검증 상태를 건드리지 않는다 |
 *
 * ⚠️ **어드민 UI 는 ko 단일**이다 (D-030). 문구를 `messages/*.json` 에 넣지 않는다.
 *
 * ⚠️ **선택지를 서버가 내려준다.** 여기서 `chest`·`barbell` 을 하드코딩하면
 * 어드민이 A-04 에서 선택지를 고쳐도 이 폼만 옛 목록으로 남는다 (D-166 이 겪은
 * "카테고리 목록 8곳 하드코딩"과 같은 유형).
 */

export type ExerciseOption = { key: string; label: string };
export type ExerciseOptions = {
  muscles: ExerciseOption[];
  equipment: ExerciseOption[];
  mechanics: ExerciseOption[];
  forces: ExerciseOption[];
};

type Fields = {
  targetMuscles: string[];
  equipmentType: string;
  mechanic: string;
  forceType: string;
  referenceUrl: string;
};

const EMPTY: Fields = {
  targetMuscles: [],
  equipmentType: "",
  mechanic: "",
  forceType: "",
  referenceUrl: "",
};

/** 분류 입력 4종 + 영상. 등록·수정이 **같은 것을 쓴다** — 갈리면 한쪽만 값이 빈다 */
function FieldsEditor({
  value,
  onChange,
  options,
}: {
  value: Fields;
  onChange: (f: Fields) => void;
  options: ExerciseOptions;
}) {
  const toggle = (key: string) => {
    const has = value.targetMuscles.includes(key);
    onChange({
      ...value,
      targetMuscles: has
        ? value.targetMuscles.filter((m) => m !== key)
        : [...value.targetMuscles, key],
    });
  };

  const select = (
    label: string,
    key: "equipmentType" | "mechanic" | "forceType",
    opts: ExerciseOption[],
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select
        value={value[key]}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        className="rounded-md border px-2 py-1 text-sm"
      >
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs text-muted-foreground">
          자극부위 (다중) — <b>근육맵이 이 값으로 칠합니다</b>
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {options.muscles.map((m) => {
            const on = value.targetMuscles.includes(m.key);
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => toggle(m.key)}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  on ? "bg-foreground text-background" : "text-muted-foreground"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {select("장비", "equipmentType", options.equipment)}
        {select("복합/단일", "mechanic", options.mechanics)}
        {select("밀기/당기기", "forceType", options.forces)}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">폼 시연 영상 URL (선택)</span>
        <input
          value={value.referenceUrl}
          onChange={(e) => onChange({ ...value, referenceUrl: e.target.value })}
          placeholder="https://…"
          className="rounded-md border px-2 py-1 text-sm"
        />
      </label>
    </div>
  );
}

/** 직접 등록 — **검증됨**으로 들어간다 */
export function ExerciseCreateForm({ options }: { options: ExerciseOptions }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border px-3 py-1.5 text-sm font-semibold"
      >
        운동 등록
      </button>
    );
  }

  return (
    <div className="w-full max-w-xl rounded-lg border p-3">
      <p className="text-sm font-semibold">운동 등록 (검증됨으로 저장됩니다)</p>
      <label className="mt-2 flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">운동명 — 널리 통용되는 이름</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="바벨 벤치프레스"
          className="rounded-md border px-2 py-1 text-sm"
        />
      </label>
      <div className="mt-3">
        <FieldsEditor value={fields} onChange={setFields} options={options} />
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={() =>
            startTransition(async () => {
              setError("");
              const res = await createExercise({
                displayName: name,
                fields: {
                  targetMuscles: fields.targetMuscles,
                  equipmentType: fields.equipmentType || null,
                  mechanic: fields.mechanic || null,
                  forceType: fields.forceType || null,
                  referenceUrl: fields.referenceUrl || null,
                },
              });
              if (res.ok) {
                setName("");
                setFields(EMPTY);
                setOpen(false);
              } else {
                setError(res.fieldErrors.displayName ?? res.formError ?? "실패했습니다");
              }
            })
          }
          className="rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-30"
        >
          등록
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

/** 수정 — 이름·분류를 고친다. **검증 상태는 건드리지 않는다** */
export function ExerciseEditForm({
  exerciseId,
  name: initialName,
  fields: initialFields,
  options,
}: {
  exerciseId: string;
  name: string;
  fields: Fields;
  options: ExerciseOptions;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [fields, setFields] = useState<Fields>(initialFields);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border px-2 py-0.5 text-xs"
      >
        수정
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border p-3 text-left">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-md border px-2 py-1 text-sm"
      />
      <div className="mt-3">
        <FieldsEditor value={fields} onChange={setFields} options={options} />
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {/* 버린 값을 보여준다 — 조용히 버리면 왜 비었는지 모른다 (D-188) */}
      {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError("");
              setMsg("");
              const res = await updateExercise({
                exerciseId,
                displayName: name,
                fields: {
                  targetMuscles: fields.targetMuscles,
                  equipmentType: fields.equipmentType || null,
                  mechanic: fields.mechanic || null,
                  forceType: fields.forceType || null,
                  referenceUrl: fields.referenceUrl || null,
                },
              });
              if (res.ok) {
                if (res.dropped?.length) setMsg(`선택지에 없어 제외됨: ${res.dropped.join(", ")}`);
                else setOpen(false);
              } else {
                setError(res.fieldErrors.displayName ?? res.formError ?? "실패했습니다");
              }
            })
          }
          className="rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-30"
        >
          저장
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

/**
 * AI 수집 패널 (`FR-11-B-01~04`, D-232).
 *
 * ## ⚠️ 수집 → 확인 → 등록. 한 번에 저장하지 않는다
 * 곧바로 넣으면 검토 없이 도감이 된다 (D-015·D-185). 표에 띄우고 어드민이
 * **고를 수 있게** 한다.
 *
 * ## ⚠️ 미검증으로 들어간다 — 화면에서 그 사실을 밝힌다
 * 같은 화면의 직접 등록은 `검증됨`이다. 결과 상태가 다르므로 **왜 다른지**를
 * 적어둔다.
 *
 * ## ⚠️ 대상 DB 를 띄운다
 * 로컬에서 돌지만 쓰는 곳은 프로덕션일 수 있다 (D-117). 어디에 쓰는지 보이지
 * 않는 쓰기가 D-116 의 본질이었다.
 */
export function ExerciseResearchPanel({
  enabled,
  disabledReason,
  options,
}: {
  enabled: boolean;
  disabledReason?: string;
  options: ExerciseOptions;
}) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState("");
  const [count, setCount] = useState(8);
  const [rows, setRows] = useState<
    {
      displayName: string;
      targetMuscles: string[];
      equipmentType: string | null;
      mechanic: string | null;
      forceType: string | null;
      checked: boolean;
      result?: { ok: boolean; error?: string };
    }[]
  >([]);
  const [dropped, setDropped] = useState<string[]>([]);
  const [targetDb, setTargetDb] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const label = (opts: ExerciseOption[], key: string | null) =>
    key ? (opts.find((o) => o.key === key)?.label ?? key) : "—";
  const picked = rows.filter((r) => r.checked && !r.result?.ok);

  if (!enabled) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
        AI 수집은 <b>로컬 개발 모드</b>에서만 동작합니다 (D-232)
        {disabledReason ? ` — ${disabledReason}` : ""}. 수동 등록·수정은 운영에서도 됩니다.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border px-3 py-1.5 text-sm"
      >
        AI 로 운동 수집
      </button>
    );
  }

  return (
    <div className="rounded-lg border p-3">
      <p className="text-sm font-semibold">
        AI 수집 — 결과는 <b>미검증</b>으로 등록됩니다 (A-05 검수 대기)
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex min-w-60 flex-1 flex-col gap-1">
          <span className="text-xs text-muted-foreground">조건 (부위·장비 등)</span>
          <input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="가슴·삼두 중심, 바벨과 덤벨"
            className="rounded-md border px-2 py-1 text-sm"
          />
        </label>
        <label className="flex w-24 flex-col gap-1">
          <span className="text-xs text-muted-foreground">건수</span>
          <input
            type="number"
            min={1}
            max={12}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="rounded-md border px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError("");
              setNote("");
              const res = await researchExerciseCandidates({ hint, count });
              if (!res.ok) {
                setError(res.formError ?? "수집 실패");
                return;
              }
              setRows(res.candidates.map((c) => ({ ...c, checked: true })));
              setDropped(res.dropped);
              setTargetDb(res.targetDb);
              /*
                ⚠️ **0건도 실패가 아니다** (E-11-02). 사유를 함께 보여준다 —
                사유가 없으면 원인을 못 짚는다 (D-188 에서 두 번 잘못 짚었다)
              */
              if (res.candidates.length === 0) setNote("후보 없음 — 아래 제외 사유를 확인하세요");
            })
          }
          className="rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-30"
        >
          수집
        </button>
      </div>

      {targetDb && (
        <p className="mt-2 text-xs text-muted-foreground">
          쓰는 곳: <b>{targetDb}</b>
        </p>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}

      {rows.length > 0 && (
        <>
          <table className="mt-3 w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="w-8" />
                <th className="py-1">운동명</th>
                <th className="py-1">자극부위</th>
                <th className="py-1">장비</th>
                <th className="py-1">복합/단일</th>
                <th className="py-1">밀기/당기기</th>
                <th className="py-1">결과</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.displayName}-${i}`} className="border-t">
                  <td className="py-1">
                    <input
                      type="checkbox"
                      checked={r.checked}
                      disabled={r.result?.ok}
                      onChange={(e) =>
                        setRows(
                          rows.map((x, j) =>
                            j === i ? { ...x, checked: e.target.checked } : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="py-1 font-semibold">{r.displayName}</td>
                  <td className="py-1">
                    {r.targetMuscles.map((m) => label(options.muscles, m)).join(", ") || "—"}
                  </td>
                  <td className="py-1">{label(options.equipment, r.equipmentType)}</td>
                  <td className="py-1">{label(options.mechanics, r.mechanic)}</td>
                  <td className="py-1">{label(options.forces, r.forceType)}</td>
                  <td className="py-1">
                    {r.result?.ok ? "등록됨" : (r.result?.error ?? "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            type="button"
            disabled={pending || picked.length === 0}
            onClick={() =>
              startTransition(async () => {
                setError("");
                const res = await createExercisesFromResearch({
                  candidates: picked.map((r) => ({
                    displayName: r.displayName,
                    targetMuscles: r.targetMuscles,
                    equipmentType: r.equipmentType,
                    mechanic: r.mechanic,
                    forceType: r.forceType,
                  })),
                });
                if (!res.ok) {
                  setError(res.formError ?? "등록 실패");
                  return;
                }
                // ⚠️ **행별 결과를 남긴다** — 일부 실패가 성공을 되돌리지 않는다
                const byName = new Map(res.results.map((x) => [x.name, x]));
                setRows(
                  rows.map((r) => {
                    const hit = byName.get(r.displayName);
                    return hit
                      ? { ...r, result: { ok: !hit.error, error: hit.error }, checked: false }
                      : r;
                  }),
                );
                setNote(`${res.created}건 등록됨 (미검증)`);
              })
            }
            className="mt-2 rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-30"
          >
            선택 {picked.length}건 등록
          </button>
        </>
      )}

      {dropped.length > 0 && (
        <div className="mt-3 rounded-md bg-muted px-2 py-1.5">
          <p className="text-xs font-semibold">제외 {dropped.length}건</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
            {dropped.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
