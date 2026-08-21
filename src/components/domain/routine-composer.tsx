"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  addRoutineEntry,
  removeRoutineEntry,
  reorderRoutineEntries,
  updateRoutineEntry,
} from "@/lib/actions/item";
import {
  RoutineEntryEditor,
  toEntryInput,
  type DraftEntry,
  type FieldLabels,
} from "@/components/domain/routine-entry-editor";
import { splitRest } from "@/lib/routine-entry";
import type { RoutineEntryView } from "@/lib/data/types";
import type { Locale } from "@/i18n/routing";

/**
 * 루틴 구성 편집 — **저장된 루틴**의 항목을 고친다 (D-227 · D-236).
 *
 * ## ⚠️ 편집기를 등록 폼과 공유한다
 * 화면(칸·요약·검색)은 `RoutineEntryEditor` 가 전부 들고 있고, 이 컴포넌트는
 * **언제 서버에 보내는가**만 정한다. 등록 폼은 저장 전까지 메모리에 모으고,
 * 여기는 변경마다 보낸다 — 편집기를 두 벌로 만들면 세트 칸의 규칙이 갈린다
 * (D-190·D-197·D-202 가 전부 같은 실패였다).
 *
 * ## ⚠️ 변경을 **항목 단위 액션**으로 번역한다
 * 편집기는 "다음 목록"을 준다. 그 차이를 보고 담기·빼기·순서·수정 중 무엇이
 * 일어났는지 판정한다 — 목록 전체를 저장하는 액션을 만들면 **덮어쓰기 경합**이
 * 생긴다(다른 기기의 변경이 조용히 사라진다).
 *
 * ## ⚠️ 낙관적으로 먼저 바꾼다
 * 순서를 옮길 때마다 서버 왕복을 기다리면 목록이 한 칸씩 늦게 움직여 유저가 두 번
 * 누른다. 화면에서 먼저 바꾸고 보낸다 — 실패하면 `router.refresh()` 가 서버
 * 상태로 되돌린다.
 */

/** 서버 뷰 → 편집기 모양 */
function toDraft(e: RoutineEntryView): DraftEntry {
  if (e.kind === "REST") {
    const { minutes, seconds } = splitRest(e.seconds);
    return { kind: "REST", id: e.id, minutes, seconds };
  }
  return {
    kind: "EXERCISE",
    id: e.id,
    exerciseId: e.exerciseId,
    name: e.name,
    inactive: e.inactive,
    // ⚠️ 빈 배열이면 칸을 하나 준다 — 0칸이면 세트를 넣을 자리가 없다
    reps: e.settings.reps.length > 0 ? e.settings.reps : [""],
    restSeconds: e.settings.restSeconds ?? "",
    weight: e.settings.weight ?? "",
    rpe: e.settings.rpe ?? "",
    tempo: e.settings.tempo ?? "",
    machineSetting: e.settings.machineSetting ?? "",
  };
}

export function RoutineComposer({
  routineId,
  entries,
  locale,
  labels,
}: {
  routineId: string;
  /** 현재 구성. **순서가 곧 내용**이다 */
  entries: RoutineEntryView[];
  locale: Locale;
  /** 세트 설정 라벨·단위 — 서버가 DB 에서 읽어 넘긴다 (D-135) */
  labels: FieldLabels;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DraftEntry[]>(() => entries.map(toDraft));

  /*
    서버가 새 값을 주면 낙관적 상태를 버린다 — 다른 기기의 변경이 반영된다.
    ⚠️ **effect 가 아니라 렌더 중에 맞춘다.** effect 에서 `setState` 하면 한 번 더
    렌더되고 그 사이 **낡은 목록이 한 프레임 보인다**
  */
  const [seen, setSeen] = useState(entries);
  if (seen !== entries) {
    setSeen(entries);
    setRows(entries.map(toDraft));
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

  /**
   * 편집기의 "다음 목록"을 **항목 단위 액션**으로 번역한다.
   *
   * | 무엇이 달라졌나 | 보내는 것 |
   * |---|---|
   * | 새 항목이 늘었다 (`id` 없음) | `addRoutineEntry` |
   * | 항목이 사라졌다 | `removeRoutineEntry` |
   * | 순서가 바뀌었다 | `reorderRoutineEntries` |
   * | 값만 바뀌었다 | `updateRoutineEntry` |
   *
   * ⚠️ **한 번에 하나만 처리한다.** 편집기의 조작이 한 번에 한 가지이기 때문이고,
   * 여러 변경을 묶어 보내면 실패했을 때 **어디까지 저장됐는지** 알 수 없다.
   */
  function apply(next: DraftEntry[]) {
    const prev = rows;
    setRows(next); // 낙관적 — 위 주석 참조

    const added = next.find((e) => !e.id);
    if (added) {
      run(() => addRoutineEntry({ routineId, entry: toEntryInput(added) }));
      return;
    }

    const removed = prev.find((e) => e.id && !next.some((n) => n.id === e.id));
    if (removed?.id) {
      const entryId = removed.id;
      run(() => removeRoutineEntry({ routineId, entryId }));
      return;
    }

    if (prev.map((e) => e.id).join(",") !== next.map((e) => e.id).join(",")) {
      run(() =>
        reorderRoutineEntries({
          routineId,
          entryIds: next.flatMap((e) => (e.id ? [e.id] : [])),
        }),
      );
      return;
    }

    // 남은 경우는 값 변경이다 — 바뀐 항목만 보낸다
    const changed = next.find((e, i) => JSON.stringify(e) !== JSON.stringify(prev[i]));
    if (changed?.id) {
      const entryId = changed.id;
      run(() => updateRoutineEntry({ routineId, entryId, entry: toEntryInput(changed) }));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <RoutineEntryEditor
        routineId={routineId}
        entries={rows}
        onChange={apply}
        labels={labels}
        locale={locale}
        disabled={pending}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
