"use client";

import { useState, useTransition } from "react";
import { resolveExerciseRequest } from "@/lib/actions/admin-exercise";

/**
 * A-18 요청 한 건의 조치 — 승인 · 반려(alias 흡수) (D-229 `FR-11-D-04·07`).
 *
 * ## ⚠️ 반려에 두 종류가 있어서 별도 컴포넌트가 필요했다
 * `AdminActionButton` 은 **인자가 고정된** 액션을 받는다. 여기서는 어드민이
 * **기존 운동을 골라야** 하므로(alias 흡수 대상) 선택 상태가 필요하다.
 *
 * | 상황 | 조치 |
 * |---|---|
 * | 없는 운동이 맞다 | **승인** → 마스터에 등재(검증됨) + 요청자 알림 |
 * | 이미 있는 운동을 다른 이름으로 요청 | 운동을 골라 **반려** → 요청명을 alias 로 흡수 |
 * | 운동으로 볼 수 없다 | 그냥 **반려** |
 *
 * ⚠️ **alias 로 흡수하지 않으면 같은 요청이 다시 온다** — 유저는 자기가 아는
 * 이름으로 검색하고, 그 이름이 어디에도 없으면 또 요청한다.
 *
 * 어드민 UI 는 ko 단일이다 (D-030).
 */
export function ExerciseRequestActions({
  requestId,
  requestedName,
  existing,
}: {
  requestId: string;
  requestedName: string;
  /** alias 흡수 대상 후보 — 마스터 전체 */
  existing: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [picked, setPicked] = useState("");
  const [done, setDone] = useState("");

  function run(input: Parameters<typeof resolveExerciseRequest>[0]) {
    setError("");
    startTransition(async () => {
      const res = await resolveExerciseRequest(input);
      if (res.ok) setDone(`처리됨 (알림 ${res.notified}명)`);
      else setError(res.fieldErrors.displayName ?? res.formError ?? "실패했습니다");
    });
  }

  if (done) return <span className="text-xs text-muted-foreground">{done}</span>;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run({ requestId, approve: true })}
          className="rounded border px-2 py-0.5 text-xs font-semibold disabled:opacity-30"
        >
          승인
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run({ requestId, approve: false, note: "운동 등재 기준 미달" })
          }
          className="rounded border px-2 py-0.5 text-xs disabled:opacity-30"
        >
          반려
        </button>
      </div>

      {/*
        ⚠️ **이 경로가 큐를 실제로 줄인다.** 반려만 하면 같은 요청이 다시 온다
        (`FR-11-D-07`)
      */}
      <div className="flex items-center gap-1">
        <select
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          className="max-w-40 rounded border px-1 py-0.5 text-xs"
        >
          <option value="">기존 운동으로 흡수…</option>
          {existing.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending || !picked}
          onClick={() =>
            run({
              requestId,
              approve: false,
              existingExerciseId: picked,
              note: `"${requestedName}" 를 alias 로 흡수`,
            })
          }
          className="rounded border px-2 py-0.5 text-xs disabled:opacity-30"
        >
          흡수
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
