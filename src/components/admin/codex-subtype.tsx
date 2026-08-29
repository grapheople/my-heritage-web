"use client";

import { useState, useTransition } from "react";
import { setCodexSubtype } from "@/lib/actions/admin";

/**
 * 도감의 **종류를 지정한다** (D-253·D-257).
 *
 * ## ⚠️ 이 컨트롤이 없어서 분류를 할 수 없었다
 * 스코프를 종류 축으로 나눠놓고(D-254) `CodexItem.subtypeId` 를 설정할 경로를
 * 만들지 않았다. 캠핑 208건이 미분류로 남아 있는 것이 그 결과다.
 *
 * ## ⚠️ 바꾸면 유일성이 다시 판정된다
 * 옮길 종류에 같은 값이 이미 있으면 서버가 **거부하고 상대를 알려준다**
 * (D-190 과 같은 태도). 여기서는 그 문구를 그대로 보여준다 — 어느 도감과
 * 부딪혔는지 모르면 어드민이 판단할 수 없다.
 */
export function CodexSubtypePicker({
  codexId,
  current,
  subtypes,
}: {
  codexId: string;
  /** `null` = 카테고리 스코프(미분류) */
  current: string | null;
  subtypes: { key: string; label: string }[];
}) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <span className="flex flex-col gap-1">
      <select
        value={current ?? ""}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            setError("");
            const res = await setCodexSubtype({ codexId, subtypeKey: next || null });
            if (!res.ok) setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
          });
        }}
        className="rounded-md border px-2 py-1 text-xs disabled:opacity-40"
      >
        {/* 미분류를 숨기지 않는다 — 무엇이 남았는지 보여야 분류가 끝난다 */}
        <option value="">미분류</option>
        {subtypes.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      {error && <span className="max-w-56 text-xs text-destructive">{error}</span>}
    </span>
  );
}
