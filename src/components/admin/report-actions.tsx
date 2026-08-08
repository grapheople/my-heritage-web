"use client";

import { useState, useTransition } from "react";
import { resolveReport } from "@/lib/actions/admin";

/**
 * 신고 조치 (A-08, FR-05-A-05·06).
 *
 * ⚠️ **조치 내용을 반드시 받는다** (FR-05-A-06 — 조치자·일시·사유 보존).
 * 고정 문구를 자동으로 넣으면 이력이 남긴 남는데 **아무 정보도 없다.**
 *
 * ⚠️ **비공개 처리는 삭제가 아니다.** 유저의 기록을 운영이 지우면 원칙 1이
 * 무너진다. 숨기고, 사유를 남기고, 신고자에게 알린다.
 */
export function ReportActions({ reportId }: { reportId: string }) {
  const [mode, setMode] = useState<"hide" | "reject" | null>(null);
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) return <span className="text-xs text-muted-foreground">처리됨</span>;

  if (mode) {
    return (
      <span className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold">
          {mode === "hide" ? "비공개 처리" : "반려"} — 조치 내용
        </span>
        <input
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          placeholder="예: 정품 인증 불가 확인"
          className="w-56 rounded-md border px-2 py-1 text-xs"
        />
        <span className="flex gap-1">
          <button
            type="button"
            disabled={pending || !resolution.trim()}
            onClick={() =>
              startTransition(async () => {
                const res = await resolveReport({ reportId, action: mode, resolution });
                if (res.ok) setDone(true);
                else setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
              })
            }
            className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            확인
          </button>
          <button
            type="button"
            onClick={() => setMode(null)}
            className="rounded-md border px-2 py-1 text-xs"
          >
            취소
          </button>
        </span>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </span>
    );
  }

  return (
    <span className="flex gap-2 whitespace-nowrap">
      {/* 콘텐츠 조치 (FR-05-A-05) */}
      <button
        type="button"
        onClick={() => setMode("hide")}
        className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
      >
        비공개 처리
      </button>
      <button
        type="button"
        onClick={() => setMode("reject")}
        className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
      >
        반려
      </button>
    </span>
  );
}
