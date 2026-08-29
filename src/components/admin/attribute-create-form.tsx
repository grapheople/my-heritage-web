"use client";

import { useState, useTransition } from "react";
import { createAttributeDefinition } from "@/lib/actions/admin";

/**
 * A-02 커스텀 속성 추가 (item-catalog F-02, D-010 · D-038).
 *
 * ## ⚠️ 3개 언어를 강제하는 이유
 * 여기서 ko 만 채우면 **일본어·영어 유저 화면에 한국어 라벨이 나온다.**
 * 어드민 UI 가 ko 단일인 것(D-030)과 **별개다** — 이 값들은 유저에게 보인다.
 * `policies/i18n` 이 "가장 흔한 누락 지점"으로 지목한 곳이고, 특히
 * **선택지(enum) 번역 누락이 제일 잦다.**
 *
 * ## 타입에 따라 필요한 것이 갈린다
 * | 타입 | 추가로 필요한 것 |
 * |---|---|
 * | `number` | **단위** 3개 언어 (D-038, FR-02-A-08) |
 * | `select`·`multiselect` | **선택지 최소 1개**, 각 3개 언어 (E-02-07) |
 *
 * `key` 는 불변이다 (A-05 규칙) — 라벨만 나중에 바꿀 수 있다. 그래서 만들 때
 * 신중해야 하고, 공통 라이브러리와 충돌하면 서버가 막는다 (E-02-09).
 */
const TYPES = [
  { value: "text", label: "한 줄" },
  { value: "textarea", label: "여러 줄" },
  { value: "number", label: "숫자" },
  { value: "select", label: "단일 선택" },
  { value: "multiselect", label: "다중 선택" },
  { value: "date", label: "날짜" },
  { value: "boolean", label: "토글" },
  { value: "url", label: "URL" },
] as const;

type Opt = { key: string; ko: string; ja: string; en: string };
const EMPTY_OPT: Opt = { key: "", ko: "", ja: "", en: "" };

export function AttributeCreateForm() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("text");
  const [label, setLabel] = useState({ ko: "", ja: "", en: "" });
  const [unit, setUnit] = useState({ ko: "", ja: "", en: "" });
  const [options, setOptions] = useState<Opt[]>([{ ...EMPTY_OPT }]);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, startTransition] = useTransition();

  const needsOptions = type === "select" || type === "multiselect";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
      >
        속성 추가
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
          const res = await createAttributeDefinition({
            key,
            type,
            label,
            unit: type === "number" ? unit : undefined,
            options: needsOptions ? options : undefined,
          });
          if (res.ok) {
            // D-250 — 붙이는 컨트롤이 생기기 전에는 이 안내가 **없는 기능**을 가리켰다
            setDone(`"${label.ko}" 속성을 추가했습니다. 아래 "이 카테고리에 없는 속성 붙이기"에서 붙이세요.`);
            setKey("");
            setLabel({ ko: "", ja: "", en: "" });
            setUnit({ ko: "", ja: "", en: "" });
            setOptions([{ ...EMPTY_OPT }]);
          } else {
            setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
          }
        });
      }}
      className="flex flex-col gap-3 rounded-lg border p-4 text-left"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">커스텀 속성 추가</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground">
          닫기
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        추가한 뒤 <b>카테고리에 붙여야</b> 등록 폼에 나옵니다 (D-097). 라벨·단위·
        선택지는 유저에게 보이므로 <b>3개 언어가 필요</b>합니다 (D-010).
      </p>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">
            key <span className="text-destructive">*</span>
          </span>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="movement"
            className="w-48 rounded-md border px-3 py-2 font-mono text-sm"
          />
          {/* key 는 불변이다 (A-05 규칙) — 라벨만 나중에 바꿀 수 있다 */}
          <span className="text-xs text-muted-foreground">나중에 바꿀 수 없습니다</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">타입</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="w-40 rounded-md border px-3 py-2 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
      </div>

      <TriInputs label="속성명" required value={label} onChange={setLabel} />

      {/* `number` 만 단위를 받는다 — 다른 타입에 저장하면 의미 없는 값이 남는다 */}
      {type === "number" && (
        <TriInputs label="단위" value={unit} onChange={setUnit} placeholder="mm / 년" />
      )}

      {needsOptions && (
        <div>
          <span className="text-sm font-semibold">
            선택지 <span className="text-destructive">*</span>
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ⚠️ enum 번역 누락이 가장 흔합니다 — 3개 언어 모두 필요
            </span>
          </span>
          <ul className="mt-1.5 flex flex-col gap-2">
            {options.map((o, i) => (
              <li key={i} className="grid grid-cols-[8rem_1fr_1fr_1fr_auto] items-end gap-2">
                <label className="block">
                  <span className="text-xs text-muted-foreground">key</span>
                  <input
                    value={o.key}
                    onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
                    placeholder="auto"
                    className="mt-0.5 w-full rounded-md border px-2 py-1.5 font-mono text-sm"
                  />
                </label>
                {(["ko", "ja", "en"] as const).map((l) => (
                  <label key={l} className="block">
                    <span className="text-xs uppercase text-muted-foreground">{l}</span>
                    <input
                      value={o[l]}
                      onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, [l]: e.target.value } : x)))}
                      className="mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}
                  className="rounded-md border px-2 py-1.5 text-xs"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setOptions([...options, { ...EMPTY_OPT }])}
            className="mt-2 rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
          >
            선택지 추가
          </button>
        </div>
      )}

      <div>
        <button
          type="submit"
          disabled={pending || !key.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {pending ? "추가 중…" : "추가"}
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {done && <p className="text-sm text-sale">{done}</p>}
    </form>
  );
}

/** 3개 언어 단일 값 입력 — 상태를 들고 있어야 해서 `TriLingualField`(form 전용) 대신 쓴다 */
function TriInputs({
  label, value, onChange, required, placeholder,
}: {
  label: string;
  value: { ko: string; ja: string; en: string };
  onChange: (v: { ko: string; ja: string; en: string }) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <span className="text-sm font-semibold">
        {label}
        {required && <span className="text-destructive"> *</span>}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          유저에게 보이는 문구 — 3개 언어 모두 필요 (D-010)
        </span>
      </span>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        {(["ko", "ja", "en"] as const).map((l) => (
          <label key={l} className="block">
            <span className="text-xs uppercase text-muted-foreground">{l}</span>
            <input
              value={value[l]}
              onChange={(e) => onChange({ ...value, [l]: e.target.value })}
              placeholder={placeholder}
              className="mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
