"use client";

import { useState, useTransition } from "react";
import { createBrand, setBrandAliases, setBrandDisplayNames } from "@/lib/actions/admin";
import { TriLingualList } from "./tri-lingual-list";

/**
 * A-11 브랜드 마스터 추가·alias 편집 (D-043 · D-047).
 *
 * ## ⚠️ alias 가 이 화면의 존재 이유다
 * 브랜드를 마스터로 묶은 것은 `Snow Peak`·`스노우피크`·`スノーピーク` 가 각각
 * 다른 브랜드가 되어 **도감이 언어별로 쪼개지는 것**을 막기 위해서다 (D-043).
 * 그런데 **alias 를 안 넣으면 한국 유저가 "스노우피크"로 검색해도 안 나온다** —
 * 브랜드가 없는 것으로 오인하고 추가 요청을 보내고, 어드민이 그걸 또 처리한다
 * (D-047). 그래서 추가 폼에서 alias 를 함께 받는다.
 */
const CATEGORIES = [
  // ⚠️ **운동은 없다** (D-166). 운동 종목에는 브랜드가 없으므로 브랜드
  // 마스터 대상이 아니다 — 여기에 추가하지 말 것 (`BRANDED_CATEGORY_KEYS` 와 같은 기준)
  { key: "watch", label: "시계" }, { key: "shoes", label: "신발" },
  { key: "bicycle", label: "자전거" }, { key: "apparel", label: "옷" },
  { key: "camping", label: "캠핑" }, { key: "deskterior", label: "데스크테리어" },
];

const EMPTY = { ko: [] as string[], ja: [] as string[], en: [] as string[] };
const EMPTY_NAMES = { ko: "", ja: "", en: "" };

type DisplayNames = { ko: string; ja: string; en: string };

/**
 * 표시용 언어별 명칭 3칸 (D-276).
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
 * ⚠️ **비우는 것이 정상이다.** 비면 원문으로 떨어지므로 이름이 사라지지 않는다.
 */
function DisplayNameFields({
  value,
  onChange,
  placeholderEn,
}: {
  value: DisplayNames;
  onChange: (v: DisplayNames) => void;
  placeholderEn?: string;
}) {
  const rows = [
    { k: "en" as const, label: "영어", ph: placeholderEn ?? "Snow Peak" },
    { k: "ko" as const, label: "한국어", ph: "스노우피크" },
    { k: "ja" as const, label: "일본어", ph: "スノーピーク" },
  ];
  return (
    <div>
      <span className="text-sm font-semibold">표시 명칭 (화면에 뜨는 이름)</span>
      <p className="mt-1 text-xs text-muted-foreground">
        위 alias 와 <b>다른 칸</b>입니다 — alias 는 검색용 정규화 토큰이라 그대로
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

export function BrandCreateForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [aliases, setAliases] = useState(EMPTY);
  const [displayNames, setDisplayNames] = useState(EMPTY_NAMES);
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
        브랜드 추가
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
          const res = await createBrand({ name, categoryKeys: cats, aliases, displayNames });
          if (res.ok) {
            setDone(`"${name}" 을 추가했습니다.`);
            setName("");
            setCats([]);
            setAliases(EMPTY);
            setDisplayNames(EMPTY_NAMES);
          } else {
            setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
          }
        });
      }}
      className="flex flex-col gap-3 rounded-lg border p-4 text-left"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">브랜드 추가</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground">
          닫기
        </button>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">
          원문 명칭 <span className="text-destructive">*</span>
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Snow Peak"
          className="w-72 rounded-md border px-3 py-2 text-sm"
        />
        {/* 중복 검사는 정규화로 한다 — `Snow Peak` 과 `snowpeak` 이 따로 쌓이면
            D-043 이 막으려던 언어별 분열이 그대로 일어난다 */}
        <span className="text-xs text-muted-foreground">
          공백·대소문자를 무시해 중복을 검사합니다 (D-014)
        </span>
      </label>

      <div>
        <span className="text-sm font-semibold">
          카테고리 <span className="text-destructive">*</span>
        </span>
        <ul className="mt-1.5 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const on = cats.includes(c.key);
            return (
              <li key={c.key}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setCats(on ? cats.filter((k) => k !== c.key) : [...cats, c.key])
                  }
                  className={
                    on
                      ? "rounded-full border border-foreground bg-foreground px-3 py-1.5 text-sm font-semibold text-background"
                      : "rounded-full border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                  }
                >
                  {c.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <TriLingualList
        label="alias (검색 전용)"
        value={aliases}
        onChange={setAliases}
        hint="⚠️ 비우면 그 언어 유저에게는 브랜드가 없는 것으로 보입니다 (D-047). 화면에는 표시되지 않고 검색에만 쓰입니다."
      />

      {/*
        ⚠️ **alias 와 다른 칸이다** (D-276). alias 는 `gshock` 같은 검색
        토큰이고 이것은 화면에 그대로 뜨는 이름이다 — 섞으면 이름이 깨진다
      */}
      <DisplayNameFields
        value={displayNames}
        onChange={setDisplayNames}
        placeholderEn={name || "Snow Peak"}
      />

      <div>
        <button
          type="submit"
          disabled={pending || !name.trim() || cats.length === 0}
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

/**
 * 기존 브랜드의 **표시명** 편집 (D-276).
 *
 * ⚠️ 원문(`Brand.name`)은 여기서 못 고친다 — CSV upsert 멱등키이자 매칭
 * 키라, 표시명을 고치다 함께 움직이면 import 가 브랜드를 중복 생성하고
 * 기존 아이템의 매칭이 끊긴다
 */
export function BrandDisplayNameEditor({
  brandId,
  brandName,
  initial,
}: {
  brandId: string;
  brandName: string;
  initial: DisplayNames;
}) {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border px-2 py-1 text-xs whitespace-nowrap hover:bg-accent"
      >
        {saved ? "저장됨" : "표시명"}
      </button>
    );
  }

  return (
    <div className="w-[520px] rounded-md border p-3 text-left">
      <p className="text-xs font-semibold">
        {brandName}
        <span className="ml-2 font-normal text-muted-foreground">원문 — 고칠 수 없습니다</span>
      </p>
      <div className="mt-2">
        <DisplayNameFields value={names} onChange={setNames} placeholderEn={brandName} />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await setBrandDisplayNames(brandId, names);
              if (res.ok) {
                setSaved(true);
                setOpen(false);
              }
            })
          }
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          저장
        </button>
        <button
          type="button"
          onClick={() => {
            setNames(initial);
            setOpen(false);
          }}
          className="rounded-md border px-3 py-1.5 text-xs"
        >
          취소
        </button>
      </div>
    </div>
  );
}

/** 기존 브랜드의 alias 편집 (D-047) */
export function BrandAliasEditor({
  brandId,
  brandName,
  initial,
}: {
  brandId: string;
  brandName: string;
  initial: { ko: string[]; ja: string[]; en: string[] };
}) {
  const [open, setOpen] = useState(false);
  const [aliases, setAliases] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border px-2 py-1 text-xs whitespace-nowrap hover:bg-accent"
      >
        {saved ? "저장됨" : "alias 편집"}
      </button>
    );
  }

  return (
    <div className="w-[520px] rounded-md border p-3 text-left">
      <p className="text-xs font-semibold">{brandName}</p>
      <div className="mt-2">
        <TriLingualList label="alias" value={aliases} onChange={setAliases} />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await setBrandAliases(brandId, aliases);
              if (res.ok) {
                setSaved(true);
                setOpen(false);
              }
            })
          }
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          저장
        </button>
        <button
          type="button"
          onClick={() => {
            setAliases(initial);
            setOpen(false);
          }}
          className="rounded-md border px-3 py-1.5 text-xs"
        >
          취소
        </button>
      </div>
    </div>
  );
}
