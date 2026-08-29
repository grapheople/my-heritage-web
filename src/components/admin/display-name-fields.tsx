"use client";

/**
 * 표시용 언어별 명칭 3칸 — **브랜드·도감 공용** (D-276).
 *
 * ## ⚠️ alias 칸과 헷갈리게 두면 안 된다
 * | | 값의 모양 | 화면에 |
 * |---|---|---|
 * | alias | 정규화된 검색 토큰 (`gshock`) | **안 보인다** |
 * | 표시명 | 사람이 읽는 그대로 (`G-SHOCK`·`지샥`) | **보인다** |
 *
 * alias 를 표시명 칸에 넣으면 목록에 `gshock` 이 뜬다. 그래서 라벨과 안내
 * 문구로 **역할을 못 헷갈리게** 갈라놓는다.
 *
 * ## ⚠️ 비우는 것이 정상이다
 * 비면 **원문**으로 떨어지므로 이름이 사라지지 않는다. 도감은 1,113건 중
 * 1,002건이 비어 있고, 라틴 원문(`Rolex Submariner 126610LN`)은 채울 이유도
 * 없다 — 컬렉터가 그렇게 부른다 (D-009).
 *
 * ⚠️ **브랜드와 도감이 이 파일 하나를 쓴다.** 복사하면 한쪽만 고쳐져 조용히
 * 갈린다 — 이 세션에서 D-190·D-197·D-270·D-275 로 반복해 나온 실패 모양이다.
 */
export type DisplayNames = { ko: string; ja: string; en: string };

export const EMPTY_DISPLAY_NAMES: DisplayNames = { ko: "", ja: "", en: "" };

export function DisplayNameFields({
  value,
  onChange,
  /** 원문 — en 칸의 placeholder 로 쓴다. 원문이 라틴이면 그대로가 정답이다 */
  original,
  /** 언어별 placeholder 를 바꾸고 싶을 때 (도감은 제품명이라 예시가 다르다) */
  samples,
}: {
  value: DisplayNames;
  onChange: (v: DisplayNames) => void;
  original?: string;
  samples?: Partial<DisplayNames>;
}) {
  const rows = [
    { k: "en" as const, label: "영어", ph: samples?.en ?? original ?? "Snow Peak" },
    { k: "ko" as const, label: "한국어", ph: samples?.ko ?? "스노우피크" },
    { k: "ja" as const, label: "일본어", ph: samples?.ja ?? "スノーピーク" },
  ];
  return (
    <div>
      <span className="text-sm font-semibold">표시 명칭 (화면에 뜨는 이름)</span>
      <p className="mt-1 text-xs text-muted-foreground">
        alias 와 <b>다른 칸</b>입니다 — alias 는 검색용 정규화 토큰이라 그대로
        띄우면 이름이 깨집니다. 비우면 <b>원문</b>으로 표시됩니다. 표시 우선순위는{" "}
        <b>영어 &gt; 한국어 &gt; 일본어</b>이며 유저의 관심 언어권에 든 것만
        후보입니다 (D-274·D-276).
      </p>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {rows.map((r) => (
          <label key={r.k} className="flex items-center gap-2 text-sm">
            <span className="w-14 shrink-0 text-xs text-muted-foreground">{r.label}</span>
            <input
              value={value[r.k]}
              onChange={(e) => onChange({ ...value, [r.k]: e.target.value })}
              placeholder={r.ph}
              className="w-72 rounded-md border px-3 py-1.5 text-sm"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
