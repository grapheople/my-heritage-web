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
 * ⚠️ **매칭 키 값이 필수다** (FR-04-A-04). 없으면 어떤 아이템에도 연결되지
 * 않아 도감이 만들어져도 비어 있다.
 *
 * ⚠️ **입력칸은 카테고리의 매칭 키 구성만큼 생긴다.** 시계·신발은 고유번호
 * 한 칸이지만 자전거는 브랜드·모델명·제조년도 세 칸이다. 한 칸으로 받으면
 * 유저 아이템이 만드는 키와 형식이 달라 **영영 매칭되지 않는다** — 도감은
 * 멀쩡히 만들어지고 보유자만 영원히 0명이라 알아채기 어렵다.
 *
 * 설명은 3개 언어다 (D-010) — 검증된 도감이므로 번역 대상이다 (FR-07-A-05).
 */
/**
 * A-03 에서 정한 매칭 키 구성 — 서버가 넘긴다 (`getCodexKeyForms`).
 *
 * ⚠️ **카테고리 이름도 서버가 준다.** 여기에 `{ watch: "시계", ... }` 맵을 두면
 * 카테고리를 추가할 때마다 빠진다 — 운동(D-163)이 실제로 `workout` 으로
 * 렌더됐다. `messages/ko.json` 이 단일 출처다 (`lib/category-label.ts`)
 */
export type CodexKeyForm = {
  categoryKey: string;
  label: string;
  parts: { key: string; label: string }[];
};

export function CodexCreateForm({ forms }: { forms: CodexKeyForm[] }) {
  const [open, setOpen] = useState(false);
  const [categoryKey, setCategoryKey] = useState(forms[0]?.categoryKey ?? "watch");
  const [displayName, setDisplayName] = useState("");
  const [keyValues, setKeyValues] = useState<Record<string, string>>({});
  const [desc, setDesc] = useState({ ko: "", ja: "", en: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, startTransition] = useTransition();

  const parts = forms.find((f) => f.categoryKey === categoryKey)?.parts ?? [];
  // 전부는 아니어도 **하나는** 있어야 한다. `brand` 는 마스터 대기로 빌 수
  // 있으므로(D-046) 전부 필수로 막지 않는다 — 서버도 같은 기준이다
  const filled = parts.some((p) => (keyValues[p.key] ?? "").trim());

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
            categoryKey, displayName, keyValues, descriptions: desc,
          });
          if (res.ok) {
            setDone(`"${displayName}" 을 검증됨 상태로 등록했습니다.`);
            setDisplayName("");
            setKeyValues({});
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
            {forms.map((f) => (
              <option key={f.categoryKey} value={f.categoryKey}>
                {f.label}
              </option>
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
        {parts.map((p) => (
          <label key={p.key} className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">
              {p.label} <span className="text-destructive">*</span>
            </span>
            <input
              value={keyValues[p.key] ?? ""}
              onChange={(e) => setKeyValues({ ...keyValues, [p.key]: e.target.value })}
              className="w-48 rounded-md border px-3 py-2 text-sm"
            />
          </label>
        ))}
      </div>

      {parts.length === 0 ? (
        <p className="rounded-md border border-warn bg-warn-bg p-3 text-xs text-warn">
          이 카테고리는 매칭 키가 아직 구성되지 않았습니다. A-03 에서 먼저
          지정해야 도감이 아이템에 연결됩니다 (FR-01-A-03).
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          매칭 키: <b>{parts.map((p) => p.label).join(" + ")}</b> — 유저 아이템도
          같은 조합으로 연결됩니다. 비우면 어떤 아이템에도 연결되지 않습니다
          (FR-04-A-04).
        </p>
      )}

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
          disabled={pending || !displayName.trim() || !filled}
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
