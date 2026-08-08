"use client";

import { useState, useTransition } from "react";
import { createCodexItem } from "@/lib/actions/admin";

/**
 * A-04 도감 직접 등록 (codex FR-04-A-01~04).
 *
 * ⚠️ **초기 상태가 검증됨이다** (FR-04-A-02). 유저 등록이 만드는 도감은
 * 미검증인데(FR-03-B-01) 반대다 — 운영자가 확인해서 넣은 것이므로 검증 큐에
 * 다시 올릴 이유가 없다. 화면에서 그 사실을 밝힌다.
 *
 * ⚠️ **고유값이 필수다** (FR-04-A-04). 없으면 어떤 아이템에도 연결되지 않아
 * 도감이 만들어져도 비어 있다.
 *
 * 설명은 3개 언어다 (D-010) — 검증된 도감이므로 번역 대상이다 (FR-07-A-05).
 */
const CATEGORIES = [
  { key: "watch", label: "시계" }, { key: "shoes", label: "신발" },
  { key: "bicycle", label: "자전거" }, { key: "apparel", label: "옷" },
  { key: "camping", label: "캠핑" }, { key: "deskterior", label: "데스크테리어" },
];

export function CodexCreateForm() {
  const [open, setOpen] = useState(false);
  const [categoryKey, setCategoryKey] = useState("watch");
  const [displayName, setDisplayName] = useState("");
  const [uniqueId, setUniqueId] = useState("");
  const [desc, setDesc] = useState({ ko: "", ja: "", en: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
      >
        도감 직접 등록
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        setDone("");
        startTransition(async () => {
          const res = await createCodexItem({
            categoryKey, displayName, uniqueId, descriptions: desc,
          });
          if (res.ok) {
            setDone(`"${displayName}" 을 검증됨 상태로 등록했습니다.`);
            setDisplayName("");
            setUniqueId("");
            setDesc({ ko: "", ja: "", en: "" });
          } else {
            setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
          }
        });
      }}
      className="flex flex-col gap-3 rounded-lg border p-4 text-left"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">도감 직접 등록</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground">
          닫기
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        어드민이 등록한 도감은 <b>검증됨</b> 상태로 시작합니다 (FR-04-A-02).
        유저 등록이 만드는 도감은 미검증입니다.
      </p>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">카테고리</span>
          <select
            value={categoryKey}
            onChange={(e) => setCategoryKey(e.target.value)}
            className="w-40 rounded-md border px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">
            명칭 (원문) <span className="text-destructive">*</span>
          </span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Rolex Submariner Date 126610LN"
            className="w-80 rounded-md border px-3 py-2 text-sm"
          />
          {/* 도감 명칭은 전 언어 공통 원문 1개다 — 번역하지 않는다 (D-009) */}
          <span className="text-xs text-muted-foreground">번역하지 않습니다 (D-009)</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">
            고유값 <span className="text-destructive">*</span>
          </span>
          <input
            value={uniqueId}
            onChange={(e) => setUniqueId(e.target.value)}
            placeholder="126610LN"
            className="w-48 rounded-md border px-3 py-2 text-sm"
          />
          <span className="text-xs text-muted-foreground">
            없으면 아이템에 연결되지 않습니다 (FR-04-A-04)
          </span>
        </label>
      </div>

      <div>
        <span className="text-sm font-semibold">
          설명
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            유저에게 보이는 문구 — 3개 언어 (D-010)
          </span>
        </span>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
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

      <div>
        <button
          type="submit"
          disabled={pending || !displayName.trim() || !uniqueId.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {pending ? "등록 중…" : "등록"}
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {done && <p className="text-sm text-sale">{done}</p>}
    </form>
  );
}
