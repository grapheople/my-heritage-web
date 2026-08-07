"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DEV_BRAND_REQUESTS, DEV_BRANDS } from "@/lib/dev-fixture";

/**
 * S-17 브랜드 추가 요청 (D-046 · D-047).
 *
 * 브랜드는 자유 텍스트가 아니라 **`select` + 어드민 마스터**다 (D-043) —
 * 자유 텍스트면 `Snow Peak`·`스노우피크`·`スノーピーク`가 각각 다른 브랜드가
 * 되어 도감이 언어별로 쪼개진다. 없는 브랜드는 이 화면으로 요청한다.
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 브랜드명 + 카테고리를 받는다 | FR-09-A-02 |
 * | **마스터에 즉시 등재하지 않는다** | FR-09-A-03 |
 * | 도감 미연결로 계속 등록할 수 있음을 안내 | FR-09-A-04, D-032 |
 * | **보너스 경험치 없음** | FR-09-A-05, D-033 |
 * | 같은 요청이 대기 중이면 **병합**, 중복 생성 안 함 | FR-09-A-06 |
 * | **기존 원문·alias와 일치하면 차단하고 그 브랜드를 보여준다** | FR-09-A-07, D-047 |
 *
 * ⚠️ 마지막 항목이 중요하다. alias 를 안 보면 한국 유저가 "롤렉스"로 요청하고
 * 일본 유저가 "ロレックス"로 요청해서 **이미 있는 Rolex 가 3개로 늘어난다.**
 */
const CATEGORIES = [
  "watch", "shoes", "bicycle", "apparel", "camping", "deskterior",
] as const;

function normalize(s: string): string {
  // D-014 정규화 축약판 — NFKC + 공백·하이픈 제거 + 소문자
  return s.normalize("NFKC").toLowerCase().replace(/[\s-]/g, "");
}

export function BrandRequestForm() {
  const t = useTranslations();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("watch");
  const [done, setDone] = useState(false);

  const n = normalize(name);
  // 기존 마스터 원문 또는 alias 와 일치하는가 (FR-09-A-07)
  const existing = n
    ? DEV_BRANDS.find(
        (b) => normalize(b.name) === n || b.aliases.some((a) => normalize(a) === n),
      )
    : undefined;
  // 이미 대기 중인 요청인가 (FR-09-A-06)
  const pending = n
    ? DEV_BRAND_REQUESTS.find((r) => normalize(r.name) === n)
    : undefined;

  if (done) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-sm font-semibold">{t("brand.submitted")}</p>
        {/* 도감 미연결로 계속 진행할 수 있음을 안내 (FR-09-A-04, D-032) */}
        <p className="mt-2 text-sm text-muted-foreground">
          {t("brand.continueWithoutCodex")}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!existing && name.trim()) setDone(true); }}
      className="flex flex-col gap-5"
    >
      <div>
        <label className="text-sm font-semibold" htmlFor="brand-name">
          {t("brand.nameLabel")}
        </label>
        <input
          id="brand-name" value={name} onChange={(e) => setName(e.target.value)}
          placeholder={t("brand.namePlaceholder")}
          className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
        />
        {/* ⚠️ 이미 있는 브랜드면 요청을 막고 그 브랜드를 보여준다 (FR-09-A-07) */}
        {existing && (
          <div className="mt-2 rounded-lg border border-warn bg-warn-bg p-3">
            <p className="flex items-start gap-2 text-sm text-warn">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t("brand.alreadyExists", { name: existing.name })}
            </p>
          </div>
        )}
        {/* 같은 요청이 대기 중이면 병합된다 (FR-09-A-06) */}
        {!existing && pending && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("brand.alreadyRequested", { count: pending.count })}
          </p>
        )}
      </div>

      <div>
        <label className="text-sm font-semibold" htmlFor="brand-category">
          {t("filter.category")}
        </label>
        <select
          id="brand-category" value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{t(`category.${c}`)}</option>
          ))}
        </select>
      </div>

      {/* 즉시 등재되지 않는다 + 그동안 등록은 계속 가능 (FR-09-A-03·04) */}
      <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        {t("brand.reviewNotice")}
      </p>

      <button
        type="submit"
        disabled={Boolean(existing) || !name.trim()}
        className="rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
      >
        {t("brand.submit")}
      </button>
    </form>
  );
}
