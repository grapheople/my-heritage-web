"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AttrDef } from "@/lib/data/attributes";

/**
 * 동적 속성 렌더러 — **8종 전부** (D-038).
 *
 * | 타입 | 입력 | 비고 |
 * |---|---|---|
 * | `text` | 한 줄 | |
 * | `textarea` | 여러 줄 | **검색 대상 아님** (FR-04-A-10) |
 * | `number` | 숫자 + **단위** | 단위는 번역 대상 (D-010) |
 * | `select` | 단일 선택 | **선택지도 번역 대상** |
 * | `multiselect` | 다중 선택 | **선택지도 번역 대상** |
 * | `date` | 날짜 | |
 * | `boolean` | 토글 | |
 * | `url` | URL | **이동 시 외부 링크 경고 경유** (D-040) |
 *
 * ⚠️ **속성명·단위·선택지는 번역 대상이고, 속성값은 아니다.**
 * 선택지(enum) 번역 누락이 가장 흔하다 (`policies/i18n`).
 * 유저가 입력한 값(`Rolex`, `명동 백화점`)은 원문 그대로 둔다.
 *
 * ⚠️ **라벨은 이미 해석돼서 온다** — 여기서 `t()` 를 부르지 않는다. 어드민이
 * 추가한 카테고리 전용 속성은 메시지 파일에 없어서 번역할 수가 없다 (D-010).
 * 라벨의 3개 언어는 DB 가 들고 있고 서버가 로케일로 골라 내린다.
 *
 * 자동 채워진 값도 **유저가 수정할 수 있다** (FR-03-A-03, 원칙 3) —
 * readonly 로 잠그지 않는다.
 */
export function AttrField({
  def,
  value,
  onChange,
  error,
  /** 도감에서 자동 채워진 값인가 (FR-03-A-01·03) */
  autoFilled = false,
  /** 브랜드 select 는 별도 UI 를 슬롯으로 받는다 (D-043) */
  brandSlot,
}: {
  def: AttrDef;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoFilled?: boolean;
  brandSlot?: React.ReactNode;
}) {
  const t = useTranslations();
  const id = `attr-${def.key}`;
  const invalid = Boolean(error);
  const base = cn(
    "mt-1.5 w-full rounded-md border px-3 py-2 text-sm",
    invalid && "border-destructive",
  );

  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-semibold" htmlFor={id}>
        {/* 서버가 로케일로 해석해 보낸 라벨이다 (D-010) */}
        {def.label}
        {def.required && <span className="text-destructive">*</span>}
        {autoFilled && (
          /* 자동 채움이지만 수정 가능함을 밝힌다 (FR-03-A-03) */
          <span className="rounded-sm bg-accent px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
            {t("reg.autoFilled")}
          </span>
        )}
      </label>

      {/*
        ⚠️ **"고유값을 모르겠어요" 체크박스를 대체한다** (D-169). 체크박스는
        비어 있음과 같은 뜻이라 불필요했다 — 대신 **비워도 된다는 사실과 그
        결과**를 항목 옆에서 알린다. 안내가 없으면 유저는 필수인 줄 알고 아무
        값이나 넣고, 그것이 곧 가짜 도감이다 (D-015).
      */}
      {def.matchingKey && !def.required && (
        <p className="mt-1 text-xs text-muted-foreground">
          {/*
            ⚠️ **필드 이름을 문구에 하드코딩하지 않는다** (D-187). 이 안내는
            **매칭 키 항목마다** 붙는데 항목은 카테고리마다 다르다 — 시계는
            `레퍼런스`, 신발은 `스타일 코드`, 자전거는 브랜드·모델명·**제조년도**
            3개, 운동은 `운동명`이다. 한 이름을 박으면 나머지에서 전부 거짓말이
            된다. D-187 이 `codexNotLinked` 에서 같은 실수를 고쳤다.

            ⚠️ 한국어는 보간값 뒤에 **고정 명사(`값`)** 를 붙인다 — 받침에 따라
            `은/는` 이 갈리고 ICU 가 맞춰주지 못한다 (D-172·D-187 과 같은 제약).
          */}
          {t("reg.matchingKeyHint", { field: def.label })}
        </p>
      )}

      {def.brandSelect ? (
        brandSlot
      ) : def.type === "textarea" ? (
        <textarea id={id} rows={3} value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(base, "resize-y")} />
      ) : def.type === "number" ? (
        <div className="mt-1.5 flex items-center gap-2">
          <input id={id} type="number" inputMode="decimal" value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn(base, "mt-0 flex-1")} />
          {/* 단위도 3개 언어다 (D-010) — 이미 해석돼 있다 */}
          {def.unit && (
            <span className="shrink-0 text-sm text-muted-foreground">{def.unit}</span>
          )}
        </div>
      ) : def.type === "select" ? (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}
          className={base}>
          <option value="">{t("reg.choose")}</option>
          {/* 선택지도 번역 대상 — 가장 흔한 누락. DB 가 3개 언어를 강제한다 */}
          {def.options?.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      ) : def.type === "multiselect" ? (
        <ul className="mt-1.5 flex flex-wrap gap-2">
          {def.options?.map((o) => {
            const k = o.key;
            /*
              ⚠️ **구분자는 `;` 다** (D-157). 서버가 `v.split(";")` 로 쪼갠다
              (`actions/item.ts`). `,` 로 조인해 보내면 부속품 2개가
              `["box,manual"]` **한 덩어리**로 저장되고, 표시에서도 옵션 키를
              못 찾아 그대로 노출된다. 읽을 때는 `,` 도 받아준다 — 그렇게
              저장된 값이 남아 있을 수 있다
            */
            const on = value.split(/[;,]/).filter(Boolean).includes(k);
            return (
              <li key={k}>
                <button type="button" aria-pressed={on}
                  onClick={() => {
                    const cur = value.split(/[;,]/).filter(Boolean);
                    onChange(
                      (on ? cur.filter((x) => x !== k) : [...cur, k]).join(";"),
                    );
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm",
                    on
                      ? "border-foreground bg-foreground font-semibold text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}>
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : def.type === "date" ? (
        <input id={id} type="date" value={value}
          onChange={(e) => onChange(e.target.value)} className={base} />
      ) : def.type === "boolean" ? (
        <label className="mt-1.5 flex items-center gap-2 text-sm">
          <input id={id} type="checkbox" checked={value === "true"}
            onChange={(e) => onChange(String(e.target.checked))} />
          {t("reg.yes")}
        </label>
      ) : def.type === "url" ? (
        <>
          <input id={id} type="url" inputMode="url" placeholder="https://"
            value={value} onChange={(e) => onChange(e.target.value)} className={base} />
          {/* 저장된 url 은 조회 시 외부 링크 경고를 경유한다 (D-040) */}
          <p className="mt-1 text-xs text-muted-foreground">{t("reg.urlWarnNotice")}</p>
        </>
      ) : (
        <input id={id} type="text" value={value}
          onChange={(e) => onChange(e.target.value)} className={base} />
      )}

      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}
