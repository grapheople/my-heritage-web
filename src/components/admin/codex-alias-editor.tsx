"use client";

import { useState, useTransition } from "react";
import { setCodexAliases } from "@/lib/actions/admin";
import { TriLingualList } from "./tri-lingual-list";

/**
 * A-07 도감 alias 편집 (D-009).
 *
 * ⚠️ **alias 는 표시 명칭이 아니다** (FR-06-A-02). 도감 명칭은 원문 1개
 * 고정이고 alias 는 **검색 인덱스 전용**이다. 화면에 나오는 것은
 * `사브마리나 로 일치` 같은 **보조 표기**뿐이다 (FR-06-B-03).
 *
 * ⚠️ **도감 간 중복 alias 를 허용한다** (FR-06-A-04). `サブマリーナ` 가
 * Submariner Date 와 No Date 양쪽에 붙을 수 있고, 검색 결과에서 원문
 * 명칭으로 구분된다. 그래서 여기서 중복을 막지 않는다.
 */
export function CodexAliasEditor({
  codexId,
  displayName,
  initial,
}: {
  codexId: string;
  displayName: string;
  initial: { ko: string[]; ja: string[]; en: string[] };
}) {
  const [open, setOpen] = useState(false);
  const [aliases, setAliases] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        // ⚠️ 열 때 지금 값으로 되맞춘다 — `useState` 는 첫 마운트에만 돈다 (D-280)
        onClick={() => {
          setAliases(initial);
          setOpen(true);
        }}
        className="rounded-md border px-2 py-1 text-xs whitespace-nowrap hover:bg-accent"
      >
        {saved ? "저장됨" : "편집"}
      </button>
    );
  }

  return (
    <div className="w-[520px] rounded-md border p-3 text-left">
      <p className="text-xs font-semibold">{displayName}</p>
      <div className="mt-2">
        <TriLingualList
          label="alias"
          value={aliases}
          onChange={setAliases}
          hint="검색 전용입니다. 표시 명칭으로 쓰이지 않고(FR-06-A-02), 도감 간 중복도 허용됩니다(FR-06-A-04)."
        />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await setCodexAliases(codexId, aliases);
              if (res.ok) {
                setSaved(true);
                setOpen(false);
              }
            })
          }
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          저장
        </button>
        <button
          type="button"
          onClick={() => {
            setAliases(initial);
            setOpen(false);
          }}
          className="rounded-md border px-3 py-1.5 text-xs"
        >
          취소
        </button>
      </div>
    </div>
  );
}
