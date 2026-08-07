"use client";

import { Check, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AttrField } from "./attr-field";
import { BrandSelect } from "./brand-select";
import { StatusBadge } from "./status-badge";
import {
  CATEGORY_ATTRS, ITEM_MAX_PHOTOS, codexAttrValues, lookupCodexByKey,
} from "@/lib/dev-fixture";

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
}: {
  fixedCategory?: string;
  initialValues?: Record<string, string>;
}) {
  const t = useTranslations();
  const [category, setCategory] = useState<string | null>(fixedCategory ?? null);
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {});
  const [autoKeys, setAutoKeys] = useState<string[]>([]);
  const [codexName, setCodexName] = useState<string | null>(null);
  const [codexVerified, setCodexVerified] = useState(false);
  /** "고유값을 모르겠어요" — 매칭 키 필수를 면제한다 (D-032, FR-01-A-02b) */
  const [unknownKey, setUnknownKey] = useState(false);
  const [photos, setPhotos] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const attrs = category ? (CATEGORY_ATTRS[category] ?? []) : [];

  function set(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
    // 매칭 키가 바뀌면 도감을 재조회하고 연결을 갱신한다 (FR-03-A-05)
    const def = attrs.find((a) => a.key === key);
    if (def?.matchingKey && category) {
      const hit = lookupCodexByKey(category, v);
      if (hit) {
        const filled = codexAttrValues(hit.id);
        setValues((prev) => ({ ...prev, ...filled, [key]: v }));
        setAutoKeys(Object.keys(filled).filter((k) => k !== key));
        setCodexName(hit.displayName);
        setCodexVerified(hit.verified);
      } else {
        setAutoKeys([]);
        setCodexName(null);
      }
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    for (const a of attrs) {
      // 매칭 키는 "모르겠어요" 시 면제 (D-032)
      const req = a.required && !(a.matchingKey && unknownKey);
      if (req && !values[a.key]?.trim()) next[a.key] = t("reg.required");
    }
    // 사진 1장 필수 (FR-07-A-03)
    if (photos === 0) next.__photos = t("reg.photoRequired");
    setErrors(next);
    if (Object.keys(next).length === 0) setDone(true);
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

  if (done) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-sm font-semibold">{t("reg.saved")}</p>
        {/* 초기 상태 명시 (FR-05-A-04) + 경험치 1일 1회 (FR-05-A-05) */}
        <p className="mt-2 text-sm text-muted-foreground">{t("reg.savedNotice")}</p>
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
              <BrandSelect value={values[a.key] ?? ""}
                onChange={(v) => set(a.key, v)} invalid={Boolean(errors[a.key])} />
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

      <button type="submit"
        className="rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
        {t("common.save")}
      </button>
    </form>
  );
}
