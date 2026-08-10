"use client";

import type { BotField } from "@/lib/bot/fields";

/**
 * 봇 아이템 항목 입력칸 (D-153).
 *
 * ## ⚠️ 항목을 코드에 박지 않는다
 * `fields` 는 DB 의 A-02 조합에서 온다. 어드민이 속성을 바꾸면 이 화면이
 * 따라온다 — 목록을 하드코딩하면 조합을 바꾼 순간 어긋난다 (D-135).
 *
 * ## ⚠️ 어드민은 i18n 컨텍스트가 없다
 * `[locale]` 라우트 밖이라 `useTranslations` 를 쓸 수 없다 (D-030·D-151).
 * 라벨은 DB 의 `labelKo` 를 그대로 쓴다.
 */
export function BotItemFields({
  fields,
  values,
  onChange,
  disabled,
}: {
  fields: BotField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
}) {
  const cls = "rounded-md border px-3 py-2 text-sm disabled:opacity-50";

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {fields
        // 브랜드는 마스터에서 골라야 해서 위에 따로 있다 (D-043)
        .filter((f) => f.key !== "brand")
        .map((f) => {
          const v = values[f.key] ?? "";
          return (
            <label key={f.key} className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">
                {f.label}
                {f.required && <span className="text-destructive"> *</span>}
                {f.isMatchingKey && (
                  <span className="ml-1 text-xs font-normal text-warn">
                    고유값
                  </span>
                )}
                <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">
                  {f.key}
                </span>
              </span>

              {f.type === "select" ? (
                <select
                  value={v}
                  disabled={disabled}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  className={cls}
                >
                  <option value="">선택 안 함</option>
                  {f.options.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "multiselect" ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-md border px-3 py-2">
                  {f.options.map((o) => {
                    // ⚠️ 저장 형식이 `;` 구분 문자열이다 — `createItemAs` 가
                    // 그렇게 쪼갠다. 여기서 형식을 바꾸면 값이 통째로 깨진다
                    const on = v.split(";").filter(Boolean).includes(o.key);
                    return (
                      <label
                        key={o.key}
                        className="flex items-center gap-1 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={disabled}
                          onChange={() => {
                            const set = new Set(v.split(";").filter(Boolean));
                            if (on) set.delete(o.key);
                            else set.add(o.key);
                            onChange(f.key, [...set].join(";"));
                          }}
                        />
                        {o.label}
                      </label>
                    );
                  })}
                </div>
              ) : f.type === "textarea" ? (
                <textarea
                  value={v}
                  disabled={disabled}
                  rows={4}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  className={cls}
                />
              ) : (
                <input
                  type={
                    f.type === "date"
                      ? "date"
                      : f.type === "number"
                        ? "number"
                        : "text"
                  }
                  value={v}
                  disabled={disabled}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  className={cls}
                />
              )}
            </label>
          );
        })}
    </div>
  );
}
