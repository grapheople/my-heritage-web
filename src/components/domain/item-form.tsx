"use client";

import { Check, Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { createItem, updateItem } from "@/lib/actions/item";
import { AttrField } from "./attr-field";
import { BrandSelect } from "./brand-select";
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
 */
const CATEGORIES = [
  "watch", "shoes", "bicycle", "apparel", "camping", "deskterior",
] as const;

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
}: {
  fixedCategory?: string;
  initialValues?: Record<string, string>;
  itemId?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [category, setCategory] = useState<string | null>(fixedCategory ?? null);
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {});
  const [autoKeys, setAutoKeys] = useState<string[]>([]);
  const [codexName, setCodexName] = useState<string | null>(null);
  const [codexVerified, setCodexVerified] = useState(false);
  /** "고유값을 모르겠어요" — 매칭 키 필수를 면제한다 (D-032, FR-01-A-02b) */
  const [unknownKey, setUnknownKey] = useState(false);
  const [photos, setPhotos] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState<
    {
      itemId: string;
      expGranted: boolean;
      codexLinked: boolean;
      codexCreated: boolean;
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
  const [loaded, setLoaded] = useState<{ category: string; defs: AttrDef[] } | null>(
    null,
  );
  useEffect(() => {
    if (!category) return;
    let alive = true;
    fetch(`/api/categories/${category}/attributes?locale=${locale}`)
      .then((r) => r.json())
      .then((d: { attributes: AttrDef[] }) => {
        if (alive) setLoaded({ category, defs: d.attributes ?? [] });
      })
      .catch(() => {
        if (alive) setLoaded({ category, defs: [] });
      });
    return () => {
      alive = false;
    };
  }, [category, locale]);

  const attrs = loaded?.category === category ? loaded.defs : [];

  function set(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
    // 매칭 키가 바뀌면 도감을 재조회하고 연결을 갱신한다 (FR-03-A-05)
    const def = attrs.find((a) => a.key === key);
    if (!def?.matchingKey || !category) return;

    // ⚠️ 정규화는 서버가 한다 — 폼이 자체 규칙을 들면 "폼에서는 연결됐는데
    // 저장하니 안 된다"가 생긴다 (D-014)
    fetch(`/api/codex/lookup?category=${category}&key=${encodeURIComponent(v)}`)
      .then((r) => r.json())
      .then((d: { codex: { displayName: string; verified: boolean } | null; values?: Record<string, string> }) => {
        if (!d.codex) {
          setAutoKeys([]);
          setCodexName(null);
          return;
        }
        const filled = d.values ?? {};
        // 자동 채운 값도 유저가 고칠 수 있다 — 잠그지 않는다 (FR-03-A-03)
        setValues((prev) => ({ ...prev, ...filled, [key]: v }));
        setAutoKeys(Object.keys(filled).filter((k) => k !== key));
        setCodexName(d.codex.displayName);
        setCodexVerified(d.codex.verified);
      })
      .catch(() => {
        setAutoKeys([]);
        setCodexName(null);
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
      // 매칭 키는 "모르겠어요" 시 면제 (D-032)
      const req = a.required && !(a.matchingKey && unknownKey);
      if (req && !values[a.key]?.trim()) next[a.key] = t("reg.required");
    }
    // 사진 1장 필수 (FR-07-A-03)
    if (photos === 0) next.__photos = t("reg.photoRequired");
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length > 0) return;

    startTransition(async () => {
      if (itemId) {
        // 수정 — 경험치도 도감 자동 생성도 없다 (FR-05-B-05)
        const res = await updateItem({ itemId, values, unknownMatchingKey: unknownKey });
        if (res.ok) {
          setSaved({ itemId, expGranted: false, codexLinked: false, codexCreated: false });
        } else {
          setErrors(res.fieldErrors);
          setFormError(res.formError ?? "");
        }
        return;
      }
      const res = await createItem({
        category,
        values,
        photoCount: photos,
        unknownMatchingKey: unknownKey,
      });
      if (res.ok) {
        setSaved({
          itemId: res.itemId,
          expGranted: res.expGranted,
          codexLinked: res.codexLinked,
          codexCreated: res.codexCreated,
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
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {CATEGORIES.map((c) => (
            <li key={c}>
              <button type="button" onClick={() => setCategory(c)}
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
                : t("reg.codexNotLinked")}
          </li>
        </ul>
        <a
          href={`/ko/items/${saved.itemId}`}
          className="mt-4 block rounded-lg border py-2.5 text-center text-sm font-semibold hover:bg-accent"
        >
          {t("reg.viewItem")}
        </a>
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
          <button type="button" onClick={() => { setCategory(null); setValues({}); }}
            className="text-sm text-muted-foreground underline">
            {t("common.edit")}
          </button>
        )}
      </div>

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
              />
            ) : undefined
          }
        />
      ))}

      {/* 고유값을 모를 때 (D-032, FR-01-A-02b) */}
      {attrs.some((a) => a.matchingKey) && (
        <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <input type="checkbox" checked={unknownKey}
            onChange={(e) => setUnknownKey(e.target.checked)} className="mt-0.5" />
          <span>
            {t("reg.unknownKey")}
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {/* 도감에 연결되지 않으면 "같은 물건 가진 사람"에 안 나타난다 (D-032) */}
              {t("reg.unknownKeyNotice")}
            </span>
          </span>
        </label>
      )}

      {/* 사진 — 2단계 하단 (FR-05-A-10). 1장 필수 (D-037) */}
      <div>
        <span className="text-sm font-semibold">
          {t("reg.photos")} <span className="text-destructive">*</span>
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          {Array.from({ length: photos }).map((_, i) => (
            <span key={i} className="relative size-16 rounded-md border bg-muted">
              {/* 첫 사진이 대표 이미지 (FR-07-A-04) */}
              {i === 0 && (
                <span className="absolute bottom-0 left-0 rounded-tr-md rounded-bl-md bg-foreground px-1 text-[10px] font-bold text-background">
                  {t("reg.cover")}
                </span>
              )}
            </span>
          ))}
          {photos < ITEM_MAX_PHOTOS && (
            <button type="button" onClick={() => setPhotos((n) => n + 1)}
              aria-label={t("diary.addPhoto")}
              className="size-16 rounded-md border border-dashed text-xl text-muted-foreground hover:bg-accent">
              +
            </button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{photos} / {ITEM_MAX_PHOTOS}</p>
        {errors.__photos && (
          <p className="mt-1.5 text-xs text-destructive">{errors.__photos}</p>
        )}
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

      <button type="submit" disabled={pending}
        className="rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
        {pending ? t("common.loading") : t("common.save")}
      </button>
    </form>
  );
}
