"use client";

import { useState, useTransition } from "react";
import { updateCodexItem } from "@/lib/actions/admin";

/**
 * A-04 도감 **명칭(원문)** 편집.
 *
 * ## ⚠️ 설명은 여기 없다 (D-282)
 * 예전에는 한 폼이 명칭과 설명을 함께 다뤘다. 둘은 **성격이 다르다**:
 *
 * | | 명칭 | 설명 |
 * |---|---|---|
 * | 언제 있나 | **항상** — 없으면 도감이 목록에 못 뜬다 | 없는 것이 기본 (전체 0건) |
 * | 검증과의 관계 | 무관 | **검증본만 3개 언어** (FR-07-A-05) |
 * | 누가 쓰나 | 어드민 | 미검증=유저 · 검증=어드민 |
 *
 * 합쳐 두니 **명칭만 고치려던 저장이 설명을 지웠다** (D-280). 목록 화면에서는
 * 설명을 읽지도 않으면서 빈 칸 3개가 함께 떴다. 갈라서 **필드마다 경로를
 * 하나로** 만든다 — 그러면 그 사고가 구조적으로 불가능하다.
 *
 * ⚠️ **고유값은 편집하지 않는다.** 바꾸면 이미 연결된 아이템들이 다른 제품의
 * 도감에 붙은 채로 남는다. 잘못 넣었으면 **새로 만들고 병합**(A-06)하는 것이
 * 맞는 경로다 — 그래야 이력이 남고 되돌릴 수 있다. 화면에서 그 사실을 밝힌다.
 *
 * ⚠️ **열 때 지금 값으로 되맞춘다** (D-280) — `useState` 는 첫 마운트에만
 * 실행되고, 이 컴포넌트는 닫혀도 언마운트되지 않는다.
 */
export function CodexEditForm({
  codexId,
  displayName,
  uniqueId,
}: {
  codexId: string;
  displayName: string;
  uniqueId: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(displayName);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setName(displayName);
          setOpen(true);
        }}
        className="rounded-md border px-2 py-1 text-xs whitespace-nowrap hover:bg-accent"
      >
        {saved ? "저장됨" : "명칭 편집"}
      </button>
    );
  }

  return (
    <div className="w-[560px] rounded-md border p-3 text-left">
      <label className="block">
        <span className="text-xs font-semibold">명칭 (원문)</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
        />
        {/* 도감 명칭은 전 언어 공통 원문 1개다 — 번역하지 않는다 (D-009).
            언어별 표기는 **표시 명칭**이 따로 담당한다 (D-276) */}
        <span className="mt-1 block text-xs text-muted-foreground">
          전 언어 공통 원문 1개입니다 (D-009). 언어별 표기는 <b>표시 명칭</b>에서
          넣습니다.
        </span>
      </label>

      <p className="mt-2 rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
        고유값 <span className="font-mono">{uniqueId || "—"}</span> 은 편집할 수
        없습니다. 바꾸면 이미 연결된 아이템이 <b>다른 제품의 도감에 붙은 채로</b>{" "}
        남습니다. 잘못 넣었으면 새로 만들고 <b>병합(A-06)</b>하세요.
      </p>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={pending || !name.trim() || name === displayName}
          onClick={() =>
            startTransition(async () => {
              const res = await updateCodexItem({ codexId, displayName: name });
              if (res.ok) {
                setSaved(true);
                setOpen(false);
              } else {
                setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
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
            setName(displayName);
            setOpen(false);
          }}
          className="rounded-md border px-3 py-1.5 text-xs"
        >
          취소
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}
