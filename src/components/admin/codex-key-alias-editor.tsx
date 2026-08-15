"use client";

import { useState, useTransition } from "react";
import { setCodexKeyAliases } from "@/lib/actions/admin";

/**
 * A-07 **키 alias** 편집 (FR-06-C-06, D-192).
 *
 * ## ⚠️ 명칭 alias 편집기와 규칙이 정반대다
 *
 * | | 명칭 alias (`CodexAliasEditor`) | **키 alias (여기)** |
 * |---|---|---|
 * | 언어축 | ko/ja/en 3칸 | **없다** — 제품 코드에 언어가 없다 |
 * | 중복 | **허용** (FR-06-A-04) | **카테고리 안에서 유일** (FR-02-B-06) |
 * | 틀렸을 때 | 검색이 조금 넓어진다 | **아이템이 엉뚱한 도감에 붙는다** |
 *
 * 그래서 저장 결과를 **건별로** 돌려준다 — 유일 제약에 걸린 값이 있어도
 * 나머지는 들어가고, **무엇이 왜 거부됐는지** 보여준다 (D-190 의 태도:
 * 고르지 않고 알린다).
 */
export function CodexKeyAliasEditor({
  codexId,
  displayName,
  normalizedKey,
  initial,
}: {
  codexId: string;
  displayName: string;
  /** 이 도감의 정식 값 — 편집 대상이 아니다. 참고로만 보여준다 */
  normalizedKey: string;
  initial: { id: string; value: string; source: string; active: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial.map((k) => k.value));
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<{ added: number; removed: number; rejected: string[] } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border px-2 py-1 text-xs whitespace-nowrap hover:bg-accent"
      >
        키 alias 편집
      </button>
    );
  }

  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) setValues([...values, v]);
    setDraft("");
  };

  return (
    <div className="w-[520px] rounded-md border p-3 text-left">
      <p className="text-xs font-semibold">{displayName}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        정식 값 <code className="rounded bg-muted px-1">{normalizedKey}</code> — 편집 대상이 아닙니다
      </p>

      <div className="mt-3 flex flex-wrap gap-1">
        {values.length === 0 && (
          <span className="text-xs text-muted-foreground">없음</span>
        )}
        {values.map((v) => {
          const meta = initial.find((k) => k.value === v);
          return (
            <span
              key={v}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                meta && !meta.active ? "border-warn text-warn" : ""
              }`}
              title={
                meta
                  ? meta.active
                    ? `출처: ${meta.source}`
                    : `출처: ${meta.source} — 승인 전이라 매칭에 쓰이지 않습니다 (FR-06-C-05)`
                  : "새로 추가"
              }
            >
              {v}
              {meta && !meta.active && <b>승인 대기</b>}
              <button
                type="button"
                onClick={() => setValues(values.filter((x) => x !== v))}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`${v} 제거`}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="예: 1460 (커뮤니티 통용 번호)"
          className="flex-1 rounded-md border px-2 py-1 text-xs"
        />
        <button type="button" onClick={add} className="rounded-md border px-3 py-1 text-xs">
          추가
        </button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        등록 매칭에 쓰입니다 (FR-02-B-05). 저장 시 <b>매칭과 같은 정규화</b>가 적용되고,
        카테고리 안에서 <b>유일</b>해야 합니다 — 이미 쓰이는 값은 거부되고 사유가 표시됩니다.
      </p>

      {result && (
        <div className="mt-2 rounded-md border p-2 text-xs">
          <p>
            추가 {result.added} · 삭제 {result.removed}
          </p>
          {result.rejected.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-warn">
              {result.rejected.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await setCodexKeyAliases(codexId, values);
              // 거부된 값이 있으면 창을 닫지 않는다 — 사유를 읽어야 한다
              if (res.ok) {
                setResult({ added: res.added, removed: res.removed, rejected: res.rejected });
                if (res.rejected.length === 0) setOpen(false);
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
            setValues(initial.map((k) => k.value));
            setResult(null);
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
