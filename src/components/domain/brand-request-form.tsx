"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { BRANDED_CATEGORY_KEYS } from "@/lib/categories";
import { submitBrandRequest } from "@/lib/actions/social";

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
/** ⚠️ 운동은 브랜드가 없다 — 선택지에서 빠진다 (D-166) */
const CATEGORIES = BRANDED_CATEGORY_KEYS;

export function BrandRequestForm() {
  const t = useTranslations();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("watch");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  /**
   * 중복 검사는 **서버가 한다** — 정규화 규칙(D-014)이 import·검색·등록과
   * 같아야 하기 때문이다. 여기서 따로 정규화하면 "요청은 됐는데 이미 있는
   * 브랜드"가 생긴다.
   *
   * ⚠️ 검사 대상 이름과 결과를 **한 쌍으로** 담는다. 따로 두면 빠르게 타이핑할
   * 때 이전 입력의 응답이 나중에 도착해 엉뚱한 경고가 뜬다.
   */
  const [checked, setChecked] = useState<{
    name: string;
    existing: { name: string } | null;
    pendingCount: number;
  } | null>(null);

  useEffect(() => {
    const q = name.trim();
    // 비었으면 아무것도 하지 않는다. 이전 결과는 아래 `fresh` 비교에서
    // 자동으로 무효가 된다 — 여기서 setState 를 부르면 렌더가 연쇄된다
    if (!q) return;
    let alive = true;
    // 타이핑마다 때리지 않는다
    const timer = setTimeout(() => {
      fetch(`/api/brand-requests/check?name=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d: { existing: { name: string } | null; pendingCount: number }) => {
          if (alive) setChecked({ name: q, ...d });
        })
        .catch(() => {
          if (alive) setChecked({ name: q, existing: null, pendingCount: 0 });
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [name]);

  const fresh = checked?.name === name.trim() ? checked : null;
  // 기존 마스터 원문 또는 alias 와 일치하는가 (FR-09-A-07)
  const existing = fresh?.existing ?? null;
  // 이미 대기 중인 요청인가 (FR-09-A-06)
  const pendingCount = fresh?.pendingCount ?? 0;

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
      onSubmit={(e) => {
        e.preventDefault();
        if (existing || !name.trim()) return;
        startTransition(async () => {
          // 마스터에 즉시 등재되지 않는다 (FR-09-A-03). 같은 요청이 이미
          // 대기 중이면 합쳐진다 (FR-09-A-06)
          const res = await submitBrandRequest({ name, categoryKey: category });
          if (res.ok) setDone(true);
          else setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
        });
      }}
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
        {!existing && pendingCount > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("brand.alreadyRequested", { count: pendingCount })}
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
        disabled={Boolean(existing) || !name.trim() || pending}
        className="rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
      >
        {t("brand.submit")}
      </button>
      {/* 서버가 막은 경우 — 마스터에 이미 있거나 카테고리 누락 (FR-09-A-07) */}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
