"use client";

import { useState, useTransition } from "react";
import { createCategorySubtype, setCategorySubtypeActive } from "@/lib/actions/admin";

export type AdminSubtype = {
  id: string;
  key: string;
  categoryKey: string;
  labels: { ko: string; ja: string; en: string };
  active: boolean;
  matchingKeys: string[];
  itemCount: number;
  attributeCount: number;
};

/**
 * A-01 하위 제품군 관리 (D-207).
 *
 * ## ⚠️ 카테고리와 다른 층이다
 * 카테고리는 **IA 의 뼈대**라 추가·삭제가 없다(D-007). 제품군은 **등록 폼과
 * 매칭에만** 영향하는 좁은 축이라 어드민이 런타임에 늘릴 수 있다.
 *
 * ## ⚠️ 삭제가 없다 — 비활성화만 (D-036)
 * 이미 그 제품군으로 등록된 아이템이 있으면 속성값이 갈 곳을 잃는다.
 * 비활성화하면 **신규 선택만** 막히고 기존 아이템은 그대로 조회된다.
 *
 * ## ⚠️ 3개 언어 필수 (D-010·D-030)
 * 어드민 UI 는 ko 단일이지만 이 라벨은 **유저 등록 폼에 보인다.** 하나만
 * 채우면 그 언어 유저만 다른 이름을 본다.
 */
export function SubtypeManager({
  categoryKey,
  categoryLabel,
  subtypes,
}: {
  categoryKey: string;
  categoryLabel: string;
  subtypes: AdminSubtype[];
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ key: "", ko: "", ja: "", en: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border px-2 py-1 text-xs whitespace-nowrap hover:bg-accent"
      >
        종류 {subtypes.length > 0 ? `${subtypes.length}개` : "추가"}
      </button>
    );
  }

  return (
    <div className="w-[560px] rounded-md border p-3 text-left">
      <p className="text-xs font-semibold">{categoryLabel} — 하위 종류</p>
      <p className="mt-1 text-xs text-muted-foreground">
        속성 집합이 다른 제품군을 가릅니다 (텐트의 수용 인원, 침낭의 내한 온도).
        <b> 종류가 없으면 등록 폼에 선택 UI 가 나오지 않습니다.</b>
      </p>

      {subtypes.length > 0 && (
        <table className="mt-3 w-full text-left text-xs">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="py-1">이름 (ko / ja / en)</th>
              <th>key</th>
              <th>전용 속성</th>
              <th>매칭 키</th>
              <th>아이템</th>
              <th>조치</th>
            </tr>
          </thead>
          <tbody>
            {subtypes.map((s) => (
              <tr key={s.id} className={s.active ? "" : "text-muted-foreground"}>
                <td className="py-1">
                  {s.labels.ko} / {s.labels.ja} / {s.labels.en}
                </td>
                <td className="font-mono">{s.key}</td>
                <td>{s.attributeCount}</td>
                <td>
                  {/* 없으면 카테고리 것으로 떨어진다 (D-207 결정 4) */}
                  {s.matchingKeys.length > 0 ? s.matchingKeys.join(" + ") : "— 카테고리 기본"}
                </td>
                <td>{s.itemCount}</td>
                <td>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await setCategorySubtypeActive(s.id, !s.active);
                      })
                    }
                    className="rounded-md border px-2 py-0.5 hover:bg-accent"
                  >
                    {s.active ? "비활성화" : "활성화"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-4 rounded-md border p-3">
        <p className="text-xs font-semibold">새 종류</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          <input
            value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value })}
            placeholder="key (tent)"
            className="rounded-md border px-2 py-1 font-mono text-xs"
          />
          {(["ko", "ja", "en"] as const).map((l) => (
            <input
              key={l}
              value={form[l]}
              onChange={(e) => setForm({ ...form, [l]: e.target.value })}
              placeholder={l}
              className="rounded-md border px-2 py-1 text-xs"
            />
          ))}
        </div>
        {error && <p className="mt-2 text-xs text-warn">{error}</p>}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const res = await createCategorySubtype({
                  categoryKey,
                  key: form.key,
                  labelKo: form.ko,
                  labelJa: form.ja,
                  labelEn: form.en,
                });
                if (res.ok) setForm({ key: "", ko: "", ja: "", en: "" });
                else setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "추가하지 못했습니다");
              })
            }
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            추가
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border px-3 py-1.5 text-xs"
          >
            닫기
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          ⚠️ 삭제는 없습니다 — 비활성화만 됩니다 (D-036). 3개 언어 모두 필요합니다 (D-010).
        </p>
      </div>
    </div>
  );
}
