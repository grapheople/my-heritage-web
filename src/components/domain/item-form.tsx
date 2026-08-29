"use client";

import { Check, Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { CATEGORY_KEYS } from "@/lib/categories";
import type { SubtypeOption } from "@/lib/subtype";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { createItem, updateItem } from "@/lib/actions/item";
import {
  RoutineEntryEditor,
  toEntryInput,
  type DraftEntry,
  type FieldLabels,
} from "@/components/domain/routine-entry-editor";
import { WORKOUT_CATEGORY } from "@/lib/categories";
import { pickDisplayName } from "@/lib/display-name";
import type { Locale } from "@/i18n/routing";
import { AttrField } from "./attr-field";
import { BrandSelect } from "./brand-select";
import { PhotoUploader } from "./photo-uploader";
import { StatusBadge } from "./status-badge";
import type { AttrDef } from "@/lib/data/attributes";

/** 사진 최대 장수 (D-037, FR-07-A-02) */
const ITEM_MAX_PHOTOS = 10;

/**
 * S-04 아이템 등록·수정 (D-076).
 *
 * ## 2단계 구성이고, 자동 채움은 **단계가 아니다**
 * ① 카테고리 선택 → ② 입력(고유번호·자동 채움·나머지·사진).
 * **고유번호 입력과 자동 채움은 같은 화면 안의 상태 변화로 처리한다**
 * (FR-05-A-09) — 별도 단계로 쪼개면 "왜 두 번 입력하지"가 된다.
 * 사진도 2단계 하단이다 (FR-05-A-10).
 *
 * ## 원칙 3 — 유저가 새로 채우는 것을 최소화한다
 * 고유번호 하나로 브랜드·모델명이 자동으로 채워진다 (FR-03-A-01).
 * **자동 채운 값도 수정할 수 있다** (FR-03-A-03) — readonly 로 잠그지 않는다.
 * 고치면 도감을 다시 찾는다 (FR-03-A-05).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 활성 속성만 **순서대로** | FR-05-A-02, D-036 |
 * | 필수 미입력 시 저장 차단 + **미입력 항목 표시** | FR-05-A-03 |
 * | 사진 1~10장, **1장 필수** | D-037, FR-07-A-02·03 |
 * | 첫 사진이 대표 이미지 | FR-07-A-04 |
 * | 초기 공개=공개, 판매=전시중 | FR-05-A-04, D-019 |
 * | **이탈 시 임시 저장하지 않는다** | FR-05-A-07 |
 * | 수정 시 **카테고리 변경 불가** | FR-05-B-02 |
 * | 1단계 선택지 = **내 관심 카테고리** | **D-271** |
 * | 브랜드·도감 명칭은 **관심 언어권 우선순위**로 표시 (en > ko > ja) | **D-276** |
 *
 * ## ⚠️ 보이는 이름과 저장되는 값은 다르다 (D-276)
 * 브랜드는 화면에 표시명(`지샥`)을 띄우지만 저장되는 값은 **원문**(`G-SHOCK`)
 * 이다. 도감 명칭도 표시만 바뀌고 매칭은 원문·키로 한다.
 */

export function ItemForm({
  /** 수정 모드 — 카테고리 고정 (FR-05-B-02) */
  fixedCategory,
  initialValues,
  /**
   * 있으면 **수정**이다. 없으면 신규.
   *
   * ⚠️ 이걸 안 넘기면 수정 화면에서 `createItem` 이 불려 **아이템이 하나 더
   * 생긴다.** 수정은 경험치도 주지 않는다 (FR-05-B-05).
   */
  itemId,
  /** 수정 모드의 기존 사진 — 안 넘기면 수정 저장에서 "사진 없음"으로 막힌다 */
  initialPhotos,
  routineFieldLabels,
  photoRequired,
  /**
   * 1단계에서 고를 수 있는 카테고리 — **내 관심사** (D-271). 서버가 넘긴다.
   *
   * ⚠️ **비어 오면 안 된다.** `myCategoryKeys()` 가 관심사가 없을 때 전체를
   * 내므로 그럴 일은 없지만, 여기서도 전체로 떨어뜨린다 — 빈 배열이 오면
   * 1단계에 버튼이 하나도 없어 **등록 자체가 막힌다**
   */
  categoryKeys,
  /**
   * 표시명 우선순위 (D-276) — 서버가 뷰어의 관심 언어권으로 계산해 넘긴다.
   *
   * ⚠️ 비어 오면 원문만 보이게 된다. 서버가 `viewerLangOrder()` 로 항상
   * 1개 이상을 넘긴다 (`myLanguages()` 가 빈 배열을 내지 않는다 — D-274)
   */
  langOrder,
}: {
  fixedCategory?: string;
  initialValues?: Record<string, string>;
  itemId?: string;
  initialPhotos?: string[];
  /**
   * D-236 — 루틴 구성 편집기의 라벨·단위. **운동 카테고리에서만 쓴다.**
   * 서버가 DB 에서 읽어 넘긴다 (D-135) — 없으면 편집기가 키 이름으로 뜬다
   */
  routineFieldLabels?: FieldLabels;
  /**
   * 카테고리별 사진 필수 여부 (D-245). 서버가 DB 에서 읽어 넘긴다.
   *
   * ⚠️ **없는 키는 필수로 본다** (`?? true`) — `updateItem` 과 같은 방향이다.
   * 반대로 두면 조회가 실패한 순간 **사진이 필요한 카테고리가 조용히 사진 없이
   * 등록된다.**
   */
  photoRequired?: Record<string, boolean>;
  categoryKeys?: string[];
  langOrder?: string[];
}) {
  // 서버가 안 넘긴 경로가 남아 있어도 이름이 비지 않게 한다
  const langs = langOrder?.length ? langOrder : ["en", "ko", "ja"];
  const categories = categoryKeys?.length ? categoryKeys : CATEGORY_KEYS;
  const t = useTranslations();
  const locale = useLocale();
  const [category, setCategory] = useState<string | null>(fixedCategory ?? null);
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {});
  const [autoKeys, setAutoKeys] = useState<string[]>([]);
  const [codexName, setCodexName] = useState<string | null>(null);
  /** FR-03-E-03 — 키 alias 로 찾았으면 저장 **전에** 알린다 (D-193) */
  const [codexAliasHit, setCodexAliasHit] = useState<string | null>(null);
  const [codexVerified, setCodexVerified] = useState(false);
  /** 업로드된 사진 URL. 순서가 표시 순서이고 첫 장이 대표다 (FR-07-A-04) */
  const [photos, setPhotos] = useState<string[]>(initialPhotos ?? []);
  /*
    사진 1장 필수인가 — **카테고리가 정한다** (D-224·D-245).
    ⚠️ **기본은 `true`** 다. 맵에 없거나 카테고리를 아직 안 골랐으면 필수로 본다 —
    `updateItem` 의 `?? true` 와 같은 방향. 반대로 두면 조회 실패가 곧
    "전 카테고리 사진 없이 등록"이 된다
  */
  const needsPhoto = category ? (photoRequired?.[category] ?? true) : true;
  /*
    D-236 — **등록 시점의 루틴 구성.** 저장 전까지 메모리에 모아 `createItem` 에
    함께 보낸다(한 트랜잭션).

    ⚠️ **수정 모드에서는 쓰지 않는다.** 저장된 루틴의 구성은 아이템 상세의
    `RoutineComposer` 가 항목 단위 액션으로 고친다 — 여기서 목록 전체를 덮어쓰면
    다른 기기의 변경이 조용히 사라진다
  */
  const [routineEntries, setRoutineEntries] = useState<DraftEntry[]>([]);
  /** 유저 별칭(선택) — 명칭을 대체하지 않는다 (D-112) */
  const [nickname, setNickname] = useState(initialValues?.__nickname ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState<
    {
      itemId: string;
      expGranted: boolean;
      codexLinked: boolean;
      codexCreated: boolean;
      /** FR-03-E-03 — 키 alias 로 연결됐는가 (D-193) */
      codexMatchedByAlias: boolean;
      codexAttemptedKey?: string;
    } | null
  >(null);
  const [pending, startTransition] = useTransition();

  /**
   * 속성 정의는 **어드민이 운영하는 값**이라 코드에 둘 수 없다 (D-036, A-02).
   *
   * ⚠️ 불러온 정의를 **어느 카테고리 것인지와 한 쌍으로** 담는다. 따로 두면
   * 카테고리를 빠르게 바꿀 때 이전 카테고리의 응답이 나중에 도착해 엉뚱한
   * 폼이 그려진다.
   */
  const [loaded, setLoaded] = useState<{
    category: string;
    subtype: string;
    defs: AttrDef[];
    subtypes: SubtypeOption[];
    subtypeRequired: boolean;
  } | null>(null);
  /**
   * D-207 — 하위 제품군(캠핑의 텐트·랜턴). **카테고리를 바꾸면 비운다** —
   * 캠핑의 `tent` 를 들고 자전거로 넘어가면 서버가 거부한다
   */
  const [subtype, setSubtype] = useState("");
  useEffect(() => {
    if (!category) return;
    let alive = true;
    const qs = new URLSearchParams({ locale });
    if (subtype) qs.set("subtype", subtype);
    fetch(`/api/categories/${category}/attributes?${qs}`)
      .then((r) => r.json())
      .then((d: { attributes: AttrDef[]; subtypes?: SubtypeOption[]; subtypeRequired?: boolean }) => {
        if (alive)
          setLoaded({
            category,
            subtype,
            defs: d.attributes ?? [],
            subtypes: d.subtypes ?? [],
            subtypeRequired: d.subtypeRequired ?? false,
          });
      })
      .catch(() => {
        if (alive)
          setLoaded({ category, subtype, defs: [], subtypes: [], subtypeRequired: false });
      });
    return () => {
      alive = false;
    };
  }, [category, subtype, locale]);

  /*
    ⚠️ **카테고리와 제품군이 둘 다 일치할 때만 쓴다.** 하나만 보면 카테고리를
    빠르게 바꿀 때 이전 응답이 나중에 도착해 엉뚱한 폼이 그려진다 (기존 주석의
    경합 문제 — 축이 하나 늘었으므로 판정도 함께 늘린다)
  */
  const fresh = loaded?.category === category && loaded.subtype === subtype;
  const attrs = fresh ? loaded.defs : [];
  // 선택지는 제품군을 고른 뒤에도 유지돼야 바꿀 수 있다
  const subtypeOptions = loaded?.category === category ? (loaded.subtypes ?? []) : [];
  /*
    D-253 — 종류가 필수인 카테고리에서는 비울 수 없다. 서버(`resolveSubtypeId`)가
    최종 관문이고 이것은 **표시와 조기 차단**이다 — 제출하고 나서 거부당하면
    유저가 어디가 문제인지 찾아 올라와야 한다
  */
  const subtypeRequired =
    loaded?.category === category ? (loaded.subtypeRequired ?? false) : false;
  const subtypeMissing = subtypeRequired && subtypeOptions.length > 0 && !subtype;
  /** 도감 연결에 필요한 항목 이름 — 이미 로케일에 맞게 온다 (`?locale=`) */
  const matchingKeyLabels = attrs
    .filter((a) => a.matchingKey)
    .map((a) => a.label)
    .join(", ");

  function set(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
    // 매칭 키가 바뀌면 도감을 재조회하고 연결을 갱신한다 (FR-03-A-05)
    const def = attrs.find((a) => a.key === key);
    if (!def?.matchingKey || !category) return;

    // ⚠️ 정규화는 서버가 한다 — 폼이 자체 규칙을 들면 "폼에서는 연결됐는데
    // 저장하니 안 된다"가 생긴다 (D-014)
    fetch(`/api/codex/lookup?category=${category}&key=${encodeURIComponent(v)}`)
      .then((r) => r.json())
      .then((d: {
        codex:
          | {
              displayName: string;
              nameKo?: string | null;
              nameJa?: string | null;
              nameEn?: string | null;
              verified: boolean;
              matchedByAlias?: boolean;
            }
          | null;
        values?: Record<string, string>;
      }) => {
        if (!d.codex) {
          setAutoKeys([]);
          setCodexName(null);
          setCodexAliasHit(null);
          return;
        }
        const filled = d.values ?? {};
        // 자동 채운 값도 유저가 고칠 수 있다 — 잠그지 않는다 (FR-03-A-03)
        setValues((prev) => ({ ...prev, ...filled, [key]: v }));
        setAutoKeys(Object.keys(filled).filter((k) => k !== key));
        /*
          ⚠️ 표시명만 고른다 (D-276). 매칭은 이미 서버에서 원문·키로 끝났고,
          여기서 바꾸는 것은 **보여주는 글자뿐**이다
        */
        setCodexName(pickDisplayName(d.codex, d.codex.displayName, langs));
        setCodexVerified(d.codex.verified);
        // ⚠️ **유저가 넣은 값을 고치지 않는다** (FR-03-E-02) — 무엇으로 찾았는지만 보여준다
        setCodexAliasHit(d.codex.matchedByAlias ? v : null);
      })
      .catch(() => {
        setAutoKeys([]);
        setCodexName(null);
        setCodexAliasHit(null);
      });
  }

  /**
   * 클라이언트 검증은 **즉시 피드백용**이다. 진짜 검증은 Server Action 이 한다 —
   * 클라이언트만 믿으면 요청을 직접 보내는 것으로 우회된다.
   */
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;

    const next: Record<string, string> = {};
    for (const a of attrs) {
      /*
        ⚠️ **면제 계산이 없어졌다** (D-169). 매칭 키를 `required` 에서 풀었으므로
        "모르겠어요"라는 상태가 따로 필요 없다 — 비어 있음이 곧 그 뜻이다.
        `model` 은 매칭 키여도 필수로 남는다 (D-118 — 이름 없는 아이템 방지).
      */
      if (a.required && !values[a.key]?.trim()) next[a.key] = t("reg.required");
    }
    /*
      사진 1장 필수 — **카테고리가 정한다** (`FR-07-A-02·03`, D-224 · D-245).
      ⚠️ 여기가 무조건이어서 **루틴을 사진 없이 등록할 수 없었다** — 서버도
      리스트도 이미 사진 없음을 다루는데 폼만 막고 있었다
    */
    if (needsPhoto && photos.length === 0) next.__photos = t("reg.photoRequired");
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length > 0) return;

    startTransition(async () => {
      if (itemId) {
        // 수정 — 경험치도 도감 자동 생성도 없다 (FR-05-B-05)
        const res = await updateItem({
          itemId,
          values,
          photoUrls: photos,
          nickname,
        });
        if (res.ok) {
          setSaved({
            itemId,
            expGranted: false,
            codexLinked: false,
            codexCreated: false,
            codexMatchedByAlias: false,
          });
        } else {
          setErrors(res.fieldErrors);
          setFormError(res.formError ?? "");
        }
        return;
      }
      const res = await createItem({
        category,
        values,
        photoUrls: photos,
        nickname,
        // D-207 — 빈 문자열이면 보내지 않는다. 서버가 카테고리 소속을 재검증한다
        subtype: subtype || undefined,
        /*
          D-236 — 루틴 구성을 **함께** 보낸다. 서버가 카테고리를 다시 보고 운동이
          아니면 무시한다 — 폼 값을 믿지 않는다
        */
        routineEntries:
          category === WORKOUT_CATEGORY && routineEntries.length > 0
            ? routineEntries.map(toEntryInput)
            : undefined,
      });
      if (res.ok) {
        setSaved({
          itemId: res.itemId,
          expGranted: res.expGranted,
          codexLinked: res.codexLinked,
          codexCreated: res.codexCreated,
          codexMatchedByAlias: res.codexMatchedByAlias,
          codexAttemptedKey: res.codexAttemptedKey,
        });
      } else {
        setErrors(res.fieldErrors);
        setFormError(res.formError ?? "");
      }
    });
  }

  /* ── 1단계: 카테고리 선택 (FR-05-A-01) ── */
  if (!category) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">{t("reg.step1")}</p>
        {/* ⚠️ **내 관심사만 나온다** (D-271). 전체 8개를 깔면 등록할 생각이
            없는 카테고리가 절반을 차지한다 — 관심사는 설정에서 넓힌다 */}
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {categories.map((c) => (
            <li key={c}>
              <button type="button" onClick={() => { setCategory(c); setSubtype(""); }}
                className="w-full rounded-lg border py-4 text-sm font-semibold hover:bg-accent">
                {t(`category.${c}`)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-sm font-semibold">{t("reg.saved")}</p>
        {/* 초기 상태 = 공개·전시중 (FR-05-A-04) */}
        <p className="mt-2 text-sm text-muted-foreground">{t("reg.savedState")}</p>
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {/* 경험치는 그날 첫 등록만 (D-026, FR-01-A-04) */}
          <li className={saved.expGranted ? "text-sale" : "text-muted-foreground"}>
            {saved.expGranted ? t("reg.expGranted") : t("reg.expAlready")}
          </li>
          {/* 도감 미연결이면 "같은 물건 가진 사람"에 안 나타난다 (D-032) */}
          <li className={saved.codexLinked ? "text-sale" : "text-muted-foreground"}>
            {/* 도감이 새로 생겼으면 그 사실을 알린다 — 보너스 경험치는 없다
                (FR-03-B-03, D-033) */}
            {saved.codexCreated
              ? t("reg.codexCreated")
              : saved.codexLinked
                ? t("reg.codexLinked")
                : /*
                     ⚠️ **필드 이름을 문구에 하드코딩하지 않는다** (D-187).
                     예전에는 "고유번호를 넣으면"이었는데, 매칭 키는 카테고리마다
                     다르다 — 자전거는 브랜드·모델명·제조년도이고 시계의 라벨은
                     "레퍼런스"다. 문구가 한 카테고리만 맞고 나머지는 틀렸다.

                     ⚠️ 한국어는 `{fields} 항목을` 처럼 **고정 명사를 뒤에 붙인다** —
                     조사가 보간값 종성에 따라 갈리지 않는다 (`을/를` 문제).
                   */
                  t("reg.codexNotLinked", { fields: matchingKeyLabels })}
          </li>
          {/*
            FR-03-E-03 — **키 alias 로 연결됐으면 그 사실을 보여준다** (D-193).
            유저가 넣은 값과 연결된 도감의 정식 값이 다르므로, 말하지 않으면
            "내가 넣은 번호가 아닌 도감에 붙었다"로 읽힌다.

            ⚠️ **유저가 넣은 값은 고치지 않았다** (FR-03-E-02) — 아이템에는
            원문 그대로 남아 있다. 아니면 도감 연결만 해제하면 된다 (FR-03-A-06).
          */}
          {saved.codexMatchedByAlias && saved.codexAttemptedKey && (
            <li className="text-muted-foreground">
              {t("reg.codexMatchedByAlias", { value: saved.codexAttemptedKey })}
            </li>
          )}
        </ul>
        {/* ⚠️ 예전에는 `/ko/` 가 하드코딩돼 있었다 — 일본어·영어 유저가
            등록하면 한국어 화면으로 튕겼다. 로케일을 붙이는 Link 를 쓴다 */}
        <Link
          href={`/items/${saved.itemId}`}
          className="mt-4 block rounded-lg border py-2.5 text-center text-sm font-semibold hover:bg-accent"
        >
          {t("reg.viewItem")}
        </Link>
      </div>
    );
  }

  /* ── 2단계: 입력 ── */
  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{t(`category.${category}`)}</p>
        {/* 수정 시 카테고리를 바꿀 수 없다 — 속성 집합이 달라진다 (FR-05-B-02) */}
        {!fixedCategory && (
          <button type="button" onClick={() => { setCategory(null); setValues({}); setSubtype(""); }}
            className="text-sm text-muted-foreground underline">
            {t("common.edit")}
          </button>
        )}
      </div>

      {/*
        D-207 — 하위 제품군 선택. **선택지가 있을 때만 그린다** — 캠핑 외
        6개 카테고리는 비어 있어 이 블록이 통째로 사라지고 기존과 같다.

        ⚠️ **수정에서는 바꿀 수 없다** (`fixedCategory`). 제품군이 바뀌면 속성
        집합이 통째로 갈려 이미 입력된 값이 갈 곳을 잃는다 — 카테고리를 못
        바꾸는 것과 같은 이유다 (FR-05-B-02)
      */}
      {subtypeOptions.length > 0 && (
        <div>
          <p className="text-sm font-semibold">
            {t("reg.subtype")}
            {subtypeRequired && <span className="ml-0.5 text-destructive">*</span>}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("reg.subtypeHint")}</p>
          {fixedCategory ? (
            <p className="mt-2 text-sm">
              {subtypeOptions.find((o) => o.key === subtype)?.label ?? t("reg.subtypeNone")}
            </p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {subtypeOptions.map((o) => (
                <li key={o.key}>
                  <button
                    type="button"
                    onClick={() => {
                      // 제품군이 바뀌면 속성 집합이 달라진다 — 값은 유지하되
                      // 폼이 새 정의를 받아 그리게 둔다 (없는 칸은 안 그려진다)
                      // 필수면 같은 것을 다시 눌러도 해제되지 않는다 — 해제하면
                      // 고를 수 없는 상태로 되돌아간다
                      setSubtype(o.key === subtype && !subtypeRequired ? "" : o.key);
                    }}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm",
                      o.key === subtype ? "border-primary font-semibold" : "hover:bg-accent",
                    )}
                  >
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 도감 매칭 결과 — 같은 화면의 상태 변화다 (FR-05-A-09) */}
      {codexName && (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3">
          <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-sale" />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
              {codexName}
              {!codexVerified && <StatusBadge variant="unverified" />}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("reg.autoFillNotice")}</p>
            {/*
              FR-03-E-03 — 키 alias 로 찾았으면 근거를 보여준다 (D-193).
              말하지 않으면 "내가 넣은 번호가 아닌 도감"으로 읽힌다
            */}
            {codexAliasHit && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("reg.codexMatchedByAlias", { value: codexAliasHit })}
              </p>
            )}
          </div>
        </div>
      )}

      {attrs.map((a) => (
        <AttrField
          key={a.key} def={a}
          value={values[a.key] ?? ""}
          onChange={(v) => set(a.key, v)}
          error={errors[a.key]}
          autoFilled={autoKeys.includes(a.key)}
          brandSlot={
            a.brandSelect ? (
              <BrandSelect
                value={values[a.key] ?? ""}
                onChange={(v) => set(a.key, v)}
                invalid={Boolean(errors[a.key])}
                category={category}
                langOrder={langs}
              />
            ) : undefined
          }
        />
      ))}

      {/* 별칭 — 선택. 같은 도감 아이템을 2개 가졌을 때 구분용 (D-112) */}
      <div>
        <label className="text-sm font-semibold" htmlFor="item-nickname">
          {t("reg.nickname")}{" "}
          <span className="font-normal text-muted-foreground">{t("diary.optional")}</span>
        </label>
        <input
          id="item-nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
        />
        {/* 명칭을 대체하지 않는다 — 명칭은 도감·브랜드에서 파생된다 (D-073) */}
        <p className="mt-1 text-xs text-muted-foreground">{t("reg.nicknameHint")}</p>
      </div>

      {/*
        D-236 — **루틴 구성.** 등록 시점에 운동·휴식을 담는다 (PM 요청).

        ⚠️ **사진보다 위에 둔다.** 운동 카테고리는 사진이 필수가 아니고(D-224)
        루틴의 본론은 구성이다 — 아래로 밀면 유저가 구성을 못 보고 저장한다.
        ⚠️ **수정 모드에서는 그리지 않는다** — 저장된 루틴은 상세에서 고친다
        (`RoutineComposer`). 여기서 목록을 덮어쓰면 다른 기기의 변경이 사라진다
      */}
      {!itemId && category === WORKOUT_CATEGORY && (
        <div>
          <span className="text-sm font-semibold">{t("item.routine")}</span>
          <div className="mt-2">
            <RoutineEntryEditor
              entries={routineEntries}
              onChange={setRoutineEntries}
              labels={routineFieldLabels ?? {}}
              locale={locale as Locale}
              disabled={pending}
            />
          </div>
        </div>
      )}

      {/* 사진 — 2단계 하단 (FR-05-A-10). 1장 필수 (D-037) */}
      <div>
        <span className="text-sm font-semibold">
          {t("reg.photos")}{" "}
          {needsPhoto ? (
            <span className="text-destructive">*</span>
          ) : (
            /* 루틴처럼 사진이 필수가 아닌 카테고리 (D-224·D-245).
               표기는 이 파일이 이미 쓰는 것을 그대로 쓴다 */
            <span className="font-normal text-muted-foreground">{t("diary.optional")}</span>
          )}
        </span>
        <PhotoUploader
          urls={photos}
          onChange={setPhotos}
          max={ITEM_MAX_PHOTOS}
          error={errors.__photos}
        />
      </div>

      {/* 이탈 시 임시 저장하지 않는다 (FR-05-A-07) */}
      <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {t("reg.noDraft")}
      </p>

      {formError && (
        <p className="rounded-lg border border-destructive bg-destructive/5 p-3 text-sm text-destructive">
          {formError}
        </p>
      )}

      {/* D-253 — 종류가 필수인데 안 골랐으면 제출 전에 알린다 */}
      {subtypeMissing && (
        <p className="text-sm text-destructive">{t("reg.subtypeRequired")}</p>
      )}

      <button type="submit" disabled={pending || subtypeMissing}
        className="rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
        {pending ? t("common.loading") : t("common.save")}
      </button>
    </form>
  );
}
