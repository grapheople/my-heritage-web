"use client";

import { useState, useTransition } from "react";
import {
  createCodexItemsFromResearch,
  researchCodexCandidates,
} from "@/lib/actions/admin";
import type { CodexKeyForm } from "@/components/admin/codex-create-form";

/**
 * A-04 도감 **자료 조사 등록** (D-185).
 *
 * ## ⚠️ 조사 → 확인 → 등록. 한 번에 저장하지 않는다
 * 조사 결과를 곧바로 넣으면 지어낸 식별 값이 검토 없이 도감이 된다 (D-015).
 * 표에 띄우고 어드민이 **고칠 수 있게** 한다 — 연도 한 자리가 틀렸을 때 행을
 * 버리는 대신 고쳐 쓰는 편이 실용적이다.
 *
 * ## ⚠️ 미검증으로 들어간다 — 화면에서 그 사실을 밝힌다
 * 직접 등록(`CodexCreateForm`)은 `검증됨`인데 여기는 `미검증`이다. 같은 화면에
 * 버튼이 둘 있으면서 결과 상태가 다르므로, **왜 다른지**를 적어둔다.
 *
 * ## ⚠️ 대상 DB 를 띄운다
 * 로컬에서 돌지만 쓰는 곳은 **프로덕션 Supabase** 다 (D-117). 어디에 쓰는지
 * 보이지 않는 쓰기가 D-116 의 본질이었다.
 */
type Row = {
  displayName: string;
  keyValues: Record<string, string>;
  checked: boolean;
  /** 등록 결과 — 행별로 갈린다 (중복은 그 행만 실패한다) */
  result?: { ok: boolean; error?: string };
};

export function CodexResearchPanel({
  forms,
  enabled,
  disabledReason,
}: {
  forms: CodexKeyForm[];
  /** 로컬 개발 모드 + `claude` CLI 가 있는가 */
  enabled: boolean;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [categoryKey, setCategoryKey] = useState(forms[0]?.categoryKey ?? "watch");
  const [brand, setBrand] = useState("");
  const [hint, setHint] = useState("");
  const [count, setCount] = useState(5);
  const [rows, setRows] = useState<Row[]>([]);
  const [dropped, setDropped] = useState<string[]>([]);
  const [targetDb, setTargetDb] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const parts = forms.find((f) => f.categoryKey === categoryKey)?.parts ?? [];
  const picked = rows.filter((r) => r.checked && !r.result?.ok);

  function research() {
    setError("");
    setNote("");
    setRows([]);
    setDropped([]);
    startTransition(async () => {
      const res = await researchCodexCandidates({ categoryKey, brand, hint, count });
      if (!res.ok) {
        setError(res.formError ?? "조사에 실패했습니다");
        return;
      }
      setTargetDb(res.targetDb);
      setDropped(res.dropped);
      setRows(
        res.candidates.map((c) => ({
          displayName: c.displayName,
          keyValues: c.keyValues,
          checked: true,
        })),
      );
      if (res.candidates.length === 0) {
        // ⚠️ 0건은 실패가 아니다. 확실한 후보가 없었다는 뜻이고 **그것이 정상
        // 동작**이다 — 건수를 채우려고 지어내는 쪽이 사고다
        setNote("확실한 후보가 없었습니다. 브랜드·힌트를 좁혀서 다시 조사해보세요.");
      }
    });
  }

  function register() {
    setError("");
    setNote("");
    startTransition(async () => {
      const res = await createCodexItemsFromResearch({
        categoryKey,
        rows: picked.map((r) => ({ displayName: r.displayName, keyValues: r.keyValues })),
      });
      if (!res.ok) {
        setError(res.formError ?? "등록에 실패했습니다");
        return;
      }
      // 이름으로 되짚는다 — 화면에서 이름을 고쳤어도 요청에 실린 값과 같다
      const byName = new Map(res.results.map((r) => [r.displayName, r]));
      setRows((prev) =>
        prev.map((r) => {
          const hit = byName.get(r.displayName);
          return hit && r.checked && !r.result?.ok
            ? { ...r, checked: false, result: { ok: hit.ok, error: hit.error } }
            : r;
        }),
      );
      const okCount = res.results.filter((r) => r.ok).length;
      setNote(
        `${okCount}건을 미검증 도감으로 등록했습니다. A-05 검수에서 확인 후 검증하세요.`,
      );
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!enabled}
        title={enabled ? undefined : disabledReason}
        className="rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-40"
      >
        자료 조사로 등록
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 text-left">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">자료 조사로 도감 등록</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground"
        >
          닫기
        </button>
      </div>

      <p className="rounded-md border border-warn bg-warn-bg p-3 text-xs text-warn">
        조사 결과는 <b>미검증</b> 상태로 등록됩니다. 어드민이 직접 입력한 도감은
        검증됨이지만(FR-04-A-02), 조사분은 <b>사람이 식별 값을 확인하지 않았기
        때문</b>입니다 — 지어낸 값이 검증 배지를 달면 그 물건을 가진 모든 유저에게
        잘못된 도감이 노출됩니다 (D-015). A-05 검수에서 확인한 뒤 검증하세요.
        <br />
        다국어 설명은 검증 후에 넣습니다 (FR-07-A-05).
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">카테고리</span>
          <select
            value={categoryKey}
            onChange={(e) => {
              setCategoryKey(e.target.value);
              setRows([]);
              setDropped([]);
            }}
            className="w-40 rounded-md border px-3 py-2 text-sm"
          >
            {forms.map((f) => (
              <option key={f.categoryKey} value={f.categoryKey}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">브랜드</span>
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Rolex"
            className="w-40 rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">힌트</span>
          <input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="다이버 워치 대표 모델"
            className="w-72 rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">건수</span>
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-20 rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={research}
          disabled={pending || parts.length === 0}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {pending ? "조사 중…" : "조사"}
        </button>
      </div>

      {parts.length === 0 ? (
        <p className="rounded-md border border-warn bg-warn-bg p-3 text-xs text-warn">
          이 카테고리는 매칭 키가 아직 구성되지 않았습니다. A-03 에서 먼저
          지정해야 조사할 값이 정해집니다.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          조사할 식별 값: <b>{parts.map((p) => p.label).join(" + ")}</b> — 이 값이
          유저 아이템과 도감을 연결합니다. 확실하지 않은 후보는 결과에서 제외됩니다
          (요청 건수보다 적게 나오는 것이 정상입니다).
        </p>
      )}

      {pending && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          로컬 claude CLI 를 호출합니다. 건수에 따라 1~4분 걸립니다.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="w-8 py-2" />
                <th className="py-2 pr-3 font-semibold">명칭 (원문)</th>
                {parts.map((p) => (
                  <th key={p.key} className="py-2 pr-3 font-semibold">
                    {p.label}
                  </th>
                ))}
                <th className="py-2 font-semibold">결과</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b align-top">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={r.checked}
                      disabled={r.result?.ok}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, checked: e.target.checked } : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="py-2 pr-3">
                    {/* 고칠 수 있게 둔다 — 거의 맞는 결과를 버리지 않게 */}
                    <input
                      value={r.displayName}
                      disabled={r.result?.ok}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, displayName: e.target.value } : x,
                          ),
                        )
                      }
                      className="w-72 rounded-md border px-2 py-1.5 text-sm disabled:opacity-60"
                    />
                  </td>
                  {parts.map((p) => (
                    <td key={p.key} className="py-2 pr-3">
                      <input
                        value={r.keyValues[p.key] ?? ""}
                        disabled={r.result?.ok}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    keyValues: { ...x.keyValues, [p.key]: e.target.value },
                                  }
                                : x,
                            ),
                          )
                        }
                        className="w-40 rounded-md border px-2 py-1.5 font-mono text-xs disabled:opacity-60"
                      />
                    </td>
                  ))}
                  <td className="py-2 text-xs">
                    {r.result?.ok && <span className="text-sale">등록됨 (미검증)</span>}
                    {r.result && !r.result.ok && (
                      <span className="text-destructive">{r.result.error}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dropped.length > 0 && (
        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          {/* 조용히 버리면 왜 건수가 적은지 알 수 없다 */}
          <b>제외된 후보 {dropped.length}건</b>
          <ul className="mt-1 list-inside list-disc">
            {dropped.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={register}
            disabled={pending || picked.length === 0}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {pending ? "등록 중…" : `선택한 ${picked.length}건 등록`}
          </button>
          {targetDb && (
            <span className="text-xs text-muted-foreground">
              대상 DB — <b>{targetDb}</b>
            </span>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {note && <p className="text-sm text-sale">{note}</p>}
    </div>
  );
}
