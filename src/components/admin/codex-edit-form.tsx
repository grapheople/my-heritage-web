"use client";

import { useState, useTransition } from "react";
import { updateCodexItem } from "@/lib/actions/admin";

/**
 * A-04 도감 명칭·설명 편집.
 *
 * ⚠️ **고유값은 편집하지 않는다.** 바꾸면 이미 연결된 아이템들이 다른 제품의
 * 도감에 붙은 채로 남는다. 잘못 넣었으면 **새로 만들고 병합**(A-06)하는 것이
 * 맞는 경로다 — 그래야 이력이 남고 되돌릴 수 있다. 화면에서 그 사실을 밝힌다.
 *
 * ⚠️ **미검증 도감에는 다국어 설명 칸을 주지 않는다** (FR-07-A-05). 미검증본은
 * 유저가 쓴 원문 1개를 그대로 보여줘야 한다 — 번역하면 운영자가 검수하지 않은
 * 내용을 서비스가 보증하는 것처럼 보인다.
 */
export function CodexEditForm({
  codexId,
  displayName,
  uniqueId,
  verified,
}: {
  codexId: string;
  displayName: string;
  uniqueId: string;
  verified: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(displayName);
  const [desc, setDesc] = useState({ ko: "", ja: "", en: "" });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border px-2 py-1 text-xs whitespace-nowrap hover:bg-accent"
      >
        {saved ? "저장됨" : "편집"}
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
      </label>

      <p className="mt-2 rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
        고유값 <span className="font-mono">{uniqueId}</span> 은 편집할 수 없습니다.
        바꾸면 이미 연결된 아이템이 <b>다른 제품의 도감에 붙은 채로</b> 남습니다.
        잘못 넣었으면 새로 만들고 <b>병합(A-06)</b>하세요.
      </p>

      {verified ? (
        <div className="mt-2">
          <span className="text-xs font-semibold">
            설명
            <span className="ml-2 font-normal text-muted-foreground">3개 언어 (D-010)</span>
          </span>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {(["ko", "ja", "en"] as const).map((l) => (
              <label key={l} className="block">
                <span className="text-xs uppercase text-muted-foreground">{l}</span>
                <textarea
                  value={desc[l]}
                  onChange={(e) => setDesc({ ...desc, [l]: e.target.value })}
                  rows={2}
                  className="mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
                />
              </label>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          미검증 도감이라 설명은 <b>유저가 쓴 원문 그대로</b> 유지됩니다
          (FR-07-A-05). 다국어 설명은 검증 후에 넣습니다.
        </p>
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={() =>
            startTransition(async () => {
              const res = await updateCodexItem({
                codexId,
                displayName: name,
                descriptions: verified ? desc : undefined,
              });
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
