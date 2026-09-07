"use client";

import { useState, useTransition } from "react";
import { setCodexSpecs } from "@/lib/actions/admin";
import type { SpecField } from "@/lib/data/codex-spec";

/**
 * 도감 스펙 편집 (A-04 상세, D-312).
 *
 * ## ⚠️ 출처를 지우지 않고 **보여준다**
 * 같은 칸에 조사값·추정값·운영값이 들어온다. 어느 것인지 안 보이면 어드민은
 * 추정값을 제조사 스펙으로 읽고 그대로 둔다 — 추정은 틀릴 수 있는 값이다.
 *
 * ## ⚠️ 저장하면 그 칸은 `운영` 이 된다
 * 어드민 값이 가장 세므로 이후 추정 배치가 덮지 않는다. 그것이 의도다 —
 * 사람이 확인한 값이 표본 몇 개에 밀리면 안 된다.
 *
 * ## ⚠️ 비우면 지운다
 * 조사·추정의 빈 값은 "모른다"라서 무시하지만, **사람이 비운 것은 "빼라"** 다.
 */
const SOURCE_LABEL: Record<string, string> = {
  ADMIN: "운영",
  RESEARCH: "조사",
  DERIVED: "추정",
};

export function CodexSpecEditor({
  codexId,
  fields,
  values,
}: {
  codexId: string;
  fields: SpecField[];
  values: Record<
    string,
    { raw: string; list: string[]; source: "ADMIN" | "RESEARCH" | "DERIVED"; sampleSize?: number }
  >;
}) {
  const [draft, setDraft] = useState<Record<string, string | string[]>>(() =>
    Object.fromEntries(
      fields.map((f) => [
        f.key,
        f.type === "multiselect" ? (values[f.key]?.list ?? []) : (values[f.key]?.raw ?? ""),
      ]),
    ),
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");

  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        이 카테고리에는 스펙 항목이 없습니다. A-02 에서 속성을 <b>도감 스펙</b>으로 켜면
        여기에 나타납니다 (D-312).
      </p>
    );
  }

  function save() {
    setMsg("");
    startTransition(async () => {
      const res = await setCodexSpecs(codexId, draft);
      // 액션은 `formError` 로 사유를 낸다 — 조용히 성공처럼 보이면 안 된다
      setMsg(res.ok ? "저장했습니다" : (res.formError ?? "저장하지 못했습니다"));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map((f) => {
          const cur = values[f.key];
          return (
            <label key={f.key} className="flex flex-col gap-1 text-sm">
              <span className="flex items-center gap-2">
                <b>{f.label}</b>
                {f.unit && <span className="text-xs text-muted-foreground">{f.unit}</span>}
                {/* 출처를 지우지 않는다 — 위 주석 참조 */}
                {cur && (
                  <span className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {SOURCE_LABEL[cur.source]}
                    {cur.source === "DERIVED" && cur.sampleSize
                      ? ` · 표본 ${cur.sampleSize}`
                      : ""}
                  </span>
                )}
              </span>

              {f.type === "select" ? (
                <select
                  value={String(draft[f.key] ?? "")}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  className="rounded-md border px-2 py-1.5"
                >
                  <option value="">— 없음</option>
                  {f.options.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "multiselect" ? (
                <span className="flex flex-wrap gap-2 rounded-md border p-2">
                  {f.options.map((o) => {
                    const list = (draft[f.key] as string[]) ?? [];
                    const on = list.includes(o.key);
                    return (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            [f.key]: on ? list.filter((v) => v !== o.key) : [...list, o.key],
                          })
                        }
                        className={`rounded-md border px-2 py-1 text-xs ${on ? "border-primary font-semibold" : ""}`}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </span>
              ) : f.type === "boolean" ? (
                <select
                  value={String(draft[f.key] ?? "")}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  className="rounded-md border px-2 py-1.5"
                >
                  <option value="">— 없음</option>
                  <option value="true">예</option>
                  <option value="false">아니오</option>
                </select>
              ) : (
                <input
                  value={String(draft[f.key] ?? "")}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  inputMode={f.type === "number" ? "decimal" : undefined}
                  placeholder={f.type === "number" ? "숫자만" : ""}
                  className="rounded-md border px-2 py-1.5"
                />
              )}
            </label>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md border px-3 py-1.5 text-sm font-semibold hover:bg-accent disabled:opacity-40"
        >
          {pending ? "저장 중…" : "스펙 저장"}
        </button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>

      <p className="text-xs text-muted-foreground">
        저장한 칸은 <b>운영</b> 값이 되어 조사·추정이 덮지 않습니다. 비우고 저장하면
        그 값을 지웁니다. 검증 상태는 바뀌지 않습니다 (D-269).
      </p>
    </div>
  );
}
