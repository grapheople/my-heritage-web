"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  attachExercise,
  detachExercise,
  reorderExercises,
} from "@/lib/actions/item";

/**
 * 루틴 구성 편집 — 종목 추가 · 제거 · 순서 (D-221, `FR-10-B-01·02·07`).
 *
 * ## ⚠️ 이 화면이 없으면 액션이 있어도 도달할 수 없다
 * 자전거 부품(D-211)이 정확히 그 상태다 — `attachPart`·`detachPart` 가 있는데
 * **부르는 화면이 한 곳도 없어** 아이템 상세는 구성을 **읽기만** 한다.
 * D-133(등록 진입점 0개)·D-157(수정 링크 0개)이 같은 유형이었다:
 * **구현 완료와 도달 가능은 다른 문제다.**
 *
 * ## ⚠️ 순서를 낙관적으로 먼저 바꾼다
 * 위/아래로 옮길 때마다 서버 왕복을 기다리면 목록이 **한 칸씩 늦게** 움직여
 * 유저가 두 번 누른다. 화면에서 먼저 바꾸고 서버에 보낸다 — 실패하면
 * `router.refresh()` 가 서버 상태로 되돌린다.
 *
 * ## ⚠️ 다른 루틴에 속한 종목도 추가 목록에 나온다
 * M:N 이므로 한 종목이 여러 루틴에 들어가는 것이 정상이다 (Q1). 거르면
 * "왜 이 종목이 없지"가 된다 — 거르는 것은 **이 루틴에 이미 있는 것**뿐이다.
 */
export function RoutineComposer({
  routineId,
  exercises,
  addable,
}: {
  routineId: string;
  /** 현재 구성. **순서가 곧 내용**이다 */
  exercises: { id: string; name: string }[];
  /** 추가 가능한 종목 — 서버가 이미 걸러서 준다 */
  addable: { id: string; name: string }[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [rows, setRows] = useState(exercises);
  const [picked, setPicked] = useState("");

  function run(fn: () => Promise<{ ok: boolean; formError?: string }>) {
    setError("");
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.formError ?? "실패했습니다");
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
          ⚠️ 종목 0개는 **정상 상태**다 (E-10-01) — 루틴을 만든 직후 반드시
          거친다. 빈 목록을 그냥 두면 고장으로 읽힌다
        */
        <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
          {t("item.routineEmpty")}
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {rows.map((e, i) => (
            <li
              key={e.id}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
            >
              <span className="w-5 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
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
              {/*
                ⚠️ **삭제가 아니라 빼기다.** 종목 아이템은 남고 방 진열로
                돌아간다 (FR-10-B-07) — 문구가 그것을 말해야 유저가 겁내지 않는다
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
            </li>
          ))}
        </ol>
      )}

      {addable.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("item.routineNone")}</p>
      ) : (
        <div className="flex gap-2">
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            disabled={pending}
            className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-sm"
          >
            <option value="">{t("item.routineAdd")}</option>
            {addable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !picked}
            onClick={() => {
              const id = picked;
              setPicked("");
              run(() => attachExercise({ routineId, exerciseId: id }));
            }}
            className="rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-30"
          >
            +
          </button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
