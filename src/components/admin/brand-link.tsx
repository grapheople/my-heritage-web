"use client";

import { useState, useTransition } from "react";
import { setBrandCategory } from "@/lib/actions/admin";

/**
 * 이 카테고리에 브랜드를 **연결한다** (D-251).
 *
 * ## ⚠️ 생성 시점에만 정할 수 있었다
 * 브랜드↔카테고리 연결은 `createBrand` 와 브랜드 요청 승인에서 `connect` 만
 * 했다. 잘못 고르면 시드 스크립트 말고는 고칠 자리가 없었다.
 *
 * ⚠️ **활성 브랜드만 후보다.** 비활성은 연결해도 유저 선택지에 안 나온다
 * (D-036·D-043) — 연결해놓고 "왜 안 보이지"를 겪게 된다.
 */
export function BrandLinkForm({
  categoryKey,
  candidates,
}: {
  categoryKey: string;
  candidates: { id: string; name: string }[];
}) {
  const [pick, setPick] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (candidates.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        활성 브랜드가 모두 이 카테고리에 연결돼 있습니다.
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
        <option value="">브랜드 선택…</option>
        {candidates.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!pick || pending}
        onClick={() =>
          startTransition(async () => {
            setError("");
            const res = await setBrandCategory({
              brandId: pick,
              categoryKey,
              linked: true,
            });
            if (res.ok) setPick("");
            else setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
          })
        }
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        {pending ? "연결하는 중…" : "연결"}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
