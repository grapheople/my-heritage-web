"use client";

import { useState, useTransition } from "react";
import { setBrandDisplayOrder } from "@/lib/actions/admin";

/**
 * 브랜드 **노출 우선순위** 편집 (A-11, D-285).
 *
 * ## ⚠️ 높을수록 앞이다
 * 0 이 기본이고 "지정 안 됨" 을 뜻한다. **방향이 반대면 기본값 0 이 맨 앞으로
 * 온다** — 실제로 그렇게 만들었다가 정반대로 동작하는 것을 실측으로 잡았다.
 *
 * ## ⚠️ 도감은 자동으로 안 따라온다
 * 도감의 `displayOrder` 는 이 값의 **복사본**이다. 바꾼 뒤
 * `pnpm tsx prisma/apply-brand-priority.ts --apply` 를 돌려야 도감 정렬에
 * 반영된다 — 화면에 그 사실을 적어 둔다. 안 돌려도 기능은 멀쩡하다.
 *
 * ⚠️ **열 때 지금 값으로 되맞춘다** (D-280).
 */
const PRESETS = [
  { v: 100, label: "대표" },
  { v: 50, label: "알려짐" },
  { v: 0, label: "없음" },
];

export function BrandPriorityEditor({
  brandId,
  brandName,
  initial,
}: {
  brandId: string;
  brandName: string;
  initial: number;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(initial));
  const [saved, setSaved] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const shown = saved ?? initial;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(String(shown));
          setError("");
          setOpen(true);
        }}
        className="rounded-md border px-2 py-1 text-xs whitespace-nowrap hover:bg-accent"
        title="노출 우선순위 — 높을수록 앞"
      >
        순위 {shown}
      </button>
    );
  }

  const save = (v: number) =>
    startTransition(async () => {
      setError("");
      const res = await setBrandDisplayOrder(brandId, v);
      if (res.ok) {
        setSaved(v);
        setOpen(false);
      } else setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
    });

  return (
    <div className="w-[380px] rounded-md border p-3 text-left">
      <p className="text-xs font-semibold">{brandName}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        노출 우선순위 — <b>높을수록 앞</b>, 0 은 지정 안 됨. 검색 결과에서는
        정확도가 먼저이고 <b>같은 순위끼리만</b> 가릅니다 (OI-54).
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.v}
            type="button"
            disabled={pending}
            onClick={() => save(p.v)}
            className={
              shown === p.v
                ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                : "rounded-full border px-3 py-1 text-xs hover:bg-accent"
            }
          >
            {p.label} {p.v}
          </button>
        ))}
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="numeric"
          className="w-16 rounded-md border px-2 py-1 text-xs"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => save(Number(value))}
          className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          저장
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border px-2 py-1 text-xs">
          취소
        </button>
      </div>

      {/* ⚠️ 도감이 자동으로 안 따라온다는 것을 알린다 — 모르면 "안 바뀐다" 고 읽는다 */}
      <p className="mt-2 rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
        도감 정렬은 이 값의 <b>복사본</b>이라 바로 따라오지 않습니다.{" "}
        <span className="font-mono">pnpm tsx prisma/apply-brand-priority.ts --apply</span> 로
        갱신합니다.
      </p>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}
