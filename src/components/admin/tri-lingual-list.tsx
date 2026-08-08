"use client";

/**
 * 3개 언어 목록 입력 — alias 처럼 **언어별로 여러 개**인 값 (D-009·D-047).
 *
 * ⚠️ `TriLingualField`(단일 값)와 다르다. alias 는 한 언어에 여러 개가 온다:
 * `ko: ["롤렉스", "롤렉스시계"]`.
 *
 * ⚠️ **alias 가 비면 그 언어 유저에게는 브랜드·도감이 없는 것으로 보인다**
 * (D-047). 한국 유저가 "롤렉스"로 검색해도 `Rolex` 가 안 나오면 추가 요청을
 * 보내고, 어드민이 그걸 또 처리한다. 그래서 입력을 권하는 문구를 붙인다.
 *
 * 쉼표로 구분해 받는다 — 항목마다 입력칸을 만들면 어드민이 10개를 넣을 때
 * 클릭이 20번이다.
 */
export function TriLingualList({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: { ko: string[]; ja: string[]; en: string[] };
  onChange: (next: { ko: string[]; ja: string[]; en: string[] }) => void;
  hint?: string;
}) {
  const total = value.ko.length + value.ja.length + value.en.length;

  return (
    <div>
      <span className="text-sm font-semibold">
        {label}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          쉼표로 구분 · 현재 {total}개
        </span>
      </span>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        {(["ko", "ja", "en"] as const).map((l) => (
          <label key={l} className="block">
            <span className="text-xs uppercase text-muted-foreground">{l}</span>
            <input
              value={value[l].join(", ")}
              onChange={(e) =>
                onChange({
                  ...value,
                  // 빈 항목은 버린다. 저장 쪽에서도 다시 거르지만 화면 카운트가 맞아야 한다
                  [l]: e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                })
              }
              className="mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
