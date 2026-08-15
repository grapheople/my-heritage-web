"use client";

import { useState, useTransition } from "react";
import { createAttributeOption, updateAttributeOption } from "@/lib/actions/admin";

export type OptionRow = {
  id: string;
  key: string;
  labels: { ko: string; ja: string; en: string };
  active: boolean;
  /** D-209 — `null` 이면 전 카테고리 공통 */
  scopedTo: string | null;
};

export type OptionGroup = {
  key: string;
  label: string;
  type: string;
  isCommon: boolean;
  usedBy: string[];
  options: OptionRow[];
};

/**
 * A-02 선택지 관리 (D-209, OI-100).
 *
 * ## ⚠️ `key` 는 만든 뒤 바꿀 수 없다
 * 아이템 값이 **key 로 저장된다.** 바꾸면 이미 입력된 값이 어느 선택지인지
 * 알 수 없게 된다 — 라벨만 바꾸는 것이 A-05 규칙이다. 그래서 편집 폼에
 * key 입력칸이 없다.
 *
 * ## ⚠️ 삭제가 없다 — 비활성화만 (D-036)
 * 이미 그 값을 고른 아이템이 있으면 라벨이 사라진다. 비활성화하면 **신규
 * 입력만** 막히고 값은 보존된다 (M-09).
 *
 * ## ⚠️ 노출 범위 (D-209)
 * 공통 속성의 선택지라도 **카테고리마다 다를 수 있다** — 시계의 `여분 링크`가
 * 캠핑 텐트 폼에 뜨던 것이 이 화면이 생긴 이유다.
 */
export function AttributeOptions({
  groups,
  categories,
}: {
  groups: OptionGroup[];
  categories: { key: string; label: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { key: string; ko: string; ja: string; en: string; cat: string }>>({});

  const label = new Map(categories.map((c) => [c.key, c.label]));
  const d = (k: string) => draft[k] ?? { key: "", ko: "", ja: "", en: "", cat: "" };

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="text-xs text-warn">{error}</p>}

      {groups.map((g) => (
        <div key={g.key} className="rounded-lg border p-3">
          <p className="text-sm font-semibold">
            {g.label}
            <span className="ml-2 font-mono text-xs text-muted-foreground">{g.key}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {g.isCommon ? "공통" : "커스텀"} · {g.type}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            쓰는 곳: {g.usedBy.length > 0 ? g.usedBy.map((u) => label.get(u) ?? u).join(", ") : "없음"}
          </p>

          <table className="mt-2 w-full text-left text-xs">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="py-1">key (불변)</th>
                <th>ko / ja / en</th>
                <th>노출 범위</th>
                <th>조치</th>
              </tr>
            </thead>
            <tbody>
              {g.options.map((o) => (
                <tr key={o.id} className={o.active ? "" : "text-muted-foreground"}>
                  <td className="py-1 font-mono">{o.key}</td>
                  <td>
                    {o.labels.ko} / {o.labels.ja} / {o.labels.en}
                  </td>
                  <td>
                    {/* D-209 — 비우면 전 카테고리 공통 */}
                    <select
                      value={o.scopedTo ?? ""}
                      disabled={pending}
                      onChange={(e) =>
                        startTransition(async () => {
                          setError(null);
                          const res = await updateAttributeOption({
                            optionId: o.id,
                            categoryKey: e.target.value === "" ? null : e.target.value,
                          });
                          if (!res.ok) setError(res.formError ?? "바꾸지 못했습니다");
                        })
                      }
                      className="rounded-md border px-2 py-0.5"
                    >
                      <option value="">전 카테고리 공통</option>
                      {categories.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label} 전용
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          setError(null);
                          const res = await updateAttributeOption({ optionId: o.id, active: !o.active });
                          if (!res.ok) setError(res.formError ?? "바꾸지 못했습니다");
                        })
                      }
                      className="rounded-md border px-2 py-0.5 hover:bg-accent"
                    >
                      {o.active ? "비활성화" : "활성화"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 grid grid-cols-5 gap-2">
            <input
              value={d(g.key).key}
              onChange={(e) => setDraft({ ...draft, [g.key]: { ...d(g.key), key: e.target.value } })}
              placeholder="key"
              className="rounded-md border px-2 py-1 font-mono text-xs"
            />
            {(["ko", "ja", "en"] as const).map((l) => (
              <input
                key={l}
                value={d(g.key)[l]}
                onChange={(e) => setDraft({ ...draft, [g.key]: { ...d(g.key), [l]: e.target.value } })}
                placeholder={l}
                className="rounded-md border px-2 py-1 text-xs"
              />
            ))}
            <select
              value={d(g.key).cat}
              onChange={(e) => setDraft({ ...draft, [g.key]: { ...d(g.key), cat: e.target.value } })}
              className="rounded-md border px-2 py-1 text-xs"
            >
              <option value="">공통</option>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label} 전용
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const v = d(g.key);
                  const res = await createAttributeOption({
                    attributeKey: g.key,
                    key: v.key,
                    labelKo: v.ko,
                    labelJa: v.ja,
                    labelEn: v.en,
                    categoryKey: v.cat || undefined,
                  });
                  if (res.ok) setDraft({ ...draft, [g.key]: { key: "", ko: "", ja: "", en: "", cat: "" } });
                  else setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "추가하지 못했습니다");
                })
              }
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              선택지 추가
            </button>
            <p className="text-xs text-muted-foreground">
              ⚠️ <b>key 는 나중에 바꿀 수 없습니다</b> — 아이템 값이 key 로 저장됩니다 (A-05).
              3개 언어 모두 필요합니다 (D-010).
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
