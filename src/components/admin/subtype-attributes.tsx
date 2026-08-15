"use client";

import { useTransition } from "react";
import { setSubtypeAttribute } from "@/lib/actions/admin";

type Attr = { key: string; label: string; type: string; required: boolean; active: boolean };

/**
 * A-02 제품군 전용 속성 (D-207).
 *
 * ## ⚠️ 공통 표에 더해지는 것이지 대체하는 것이 아니다
 * 등록 폼은 **카테고리 공통 + 선택된 제품군**을 합쳐 그린다. 여기 있는 것은
 * 그 제품군을 골랐을 때만 나타나는 항목이다 (텐트의 수용 인원).
 *
 * ## ⚠️ 삭제가 없다 — 비활성화만 (D-036)
 * 이미 입력된 값이 사라지기 때문이다. 비활성화하면 신규 입력만 막히고
 * **값은 보존된다** (M-09).
 */
export function SubtypeAttributes({
  subtypeId,
  label,
  active,
  attrs,
  candidates,
}: {
  subtypeId: string;
  label: string;
  active: boolean;
  attrs: Attr[];
  /** 아직 이 제품군에 붙지 않은 속성 정의 */
  candidates: { key: string; label: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const attached = new Set(attrs.map((a) => a.key));
  const addable = candidates.filter((c) => !attached.has(c.key));

  return (
    <div className={`rounded-lg border p-3 ${active ? "" : "opacity-60"}`}>
      <p className="text-sm font-semibold">
        {label}
        {!active && <span className="ml-2 text-xs text-muted-foreground">비활성</span>}
      </p>

      {attrs.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          전용 속성 없음 — 이 종류를 골라도 <b>공통 속성만</b> 나옵니다
        </p>
      ) : (
        <table className="mt-2 w-full text-left text-xs">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="py-1">속성명</th>
              <th>key</th>
              <th>타입</th>
              <th>필수</th>
              <th>조치</th>
            </tr>
          </thead>
          <tbody>
            {attrs.map((a) => (
              <tr key={a.key} className={a.active ? "" : "text-muted-foreground"}>
                <td className="py-1 font-semibold">{a.label}</td>
                <td className="font-mono">{a.key}</td>
                <td>{a.type}</td>
                <td>{a.required ? "필수" : "—"}</td>
                <td>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await setSubtypeAttribute({
                            subtypeId,
                            attributeKey: a.key,
                            active: !a.active,
                          });
                        })
                      }
                      className="rounded-md border px-2 py-0.5 hover:bg-accent"
                    >
                      {a.active ? "비활성화" : "활성화"}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await setSubtypeAttribute({
                            subtypeId,
                            attributeKey: a.key,
                            required: !a.required,
                          });
                        })
                      }
                      className="rounded-md border px-2 py-0.5 hover:bg-accent"
                    >
                      {a.required ? "선택으로" : "필수로"}
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {addable.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <select
            id={`add-${subtypeId}`}
            defaultValue=""
            className="rounded-md border px-2 py-1 text-xs"
          >
            <option value="" disabled>
              속성 추가…
            </option>
            {addable.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label} ({c.key})
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const el = document.getElementById(`add-${subtypeId}`) as HTMLSelectElement | null;
              const key = el?.value;
              if (!key) return;
              startTransition(async () => {
                await setSubtypeAttribute({
                  subtypeId,
                  attributeKey: key,
                  displayOrder: attrs.length,
                });
                if (el) el.value = "";
              });
            }}
            className="rounded-md border px-3 py-1 text-xs hover:bg-accent"
          >
            추가
          </button>
        </div>
      )}
    </div>
  );
}
