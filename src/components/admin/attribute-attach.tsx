"use client";

import { useState, useTransition } from "react";
import { setCategoryAttribute } from "@/lib/actions/admin";

/**
 * 이 카테고리에 아직 없는 속성을 **붙인다** (D-250).
 *
 * ## ⚠️ 왜 필요한가 — 안내문이 없는 기능을 가리키고 있었다
 * `createAttributeDefinition` 은 `AttributeDefinition` 만 만들고
 * `CategoryAttribute` 행은 만들지 않는다. `AttributeCreateForm` 은 그래서
 * **"추가한 뒤 카테고리에 붙여야 등록 폼에 나옵니다"** 라고 안내하는데,
 * 정작 **붙이는 컨트롤이 표에 없었다.** 표는 이미 붙은 속성의 비활성화·필수만
 * 토글한다.
 *
 * 제품군에는 있다(`SubtypeAttributes` 의 `candidates`). 카테고리 본체에만
 * 빠져 있었다.
 *
 * **새 서버 액션이 없다** — `setCategoryAttribute` 가 upsert 라 없으면 만든다.
 *
 * ⚠️ 붙일 때 `active: true` 만 준다. **`required` 는 기본값(false)** 으로 둔다 —
 * 필수는 등록 완주율에 직결되므로(D-039) 붙이는 것과 같은 동작으로 처리하지
 * 않는다. 붙인 뒤 표에서 따로 켠다.
 */
export function AttributeAttach({
  categoryKey,
  candidates,
}: {
  categoryKey: string;
  candidates: { key: string; label: string; type: string }[];
}) {
  const [pick, setPick] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (candidates.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        공통 속성 라이브러리의 모든 속성이 이 카테고리에 붙어 있습니다.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        className="rounded-md border px-2 py-1.5 text-sm"
      >
        <option value="">속성 선택…</option>
        {candidates.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label} ({c.key})
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!pick || pending}
        onClick={() =>
          startTransition(async () => {
            setError("");
            const res = await setCategoryAttribute({
              categoryKey,
              attributeKey: pick,
              active: true,
            });
            if (res.ok) setPick("");
            else setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
          })
        }
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        {pending ? "붙이는 중…" : "붙이기"}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
