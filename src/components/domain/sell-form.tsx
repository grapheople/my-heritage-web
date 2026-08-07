"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { CurrencyCode } from "@/lib/format";

/**
 * 판매 전환 폼 (D-050).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 가격·통화·외부 링크 **3개 모두 필수** | FR-01-A-02 |
 * | 하나라도 비면 전환 차단 + 미입력 항목 표시 | FR-01-A-03 |
 * | 통화 기본값은 **판매자 언어 기준** (ko→KRW, ja→JPY, en→USD) | FR-01-A-04 |
 * | 비공개 아이템이면 **공개 전환 필요를 안내하고 확인을 받는다** | FR-01-A-05 |
 * | `http`/`https` 스킴만. 도메인 화이트리스트는 두지 않는다 | FR-01-B-02·03·04 |
 * | 가격 변경 이력을 유저에게 노출하지 않는다 | FR-01-B-05, D-063 |
 */
const CURRENCY_BY_LOCALE: Record<string, CurrencyCode> = {
  ko: "KRW", ja: "JPY", en: "USD",
};

const CURRENCIES: CurrencyCode[] = ["KRW", "JPY", "USD"];

export function SellForm({
  locale,
  isPrivate,
  onSale,
  initial,
}: {
  locale: string;
  isPrivate: boolean;
  onSale: boolean;
  initial?: { price: number; currency: CurrencyCode; url: string };
}) {
  const t = useTranslations();

  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [currency, setCurrency] = useState<CurrencyCode>(
    // 판매자 언어 기준 프리셀렉트 (FR-01-A-04)
    initial?.currency ?? CURRENCY_BY_LOCALE[locale] ?? "USD",
  );
  const [url, setUrl] = useState(initial?.url ?? "");
  // 비공개면 공개 전환 확인을 받아야 한다 (FR-01-A-05)
  const [agreePublic, setAgreePublic] = useState(!isPrivate);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!price.trim() || Number(price) <= 0) e.price = t("sell.errPrice");
    if (!currency) e.currency = t("sell.errCurrency");
    if (!url.trim()) {
      e.url = t("sell.errUrlRequired");
    } else {
      // http/https 만 허용 (FR-01-B-03). 도메인 제한은 없다 (FR-01-B-04)
      try {
        const u = new URL(url);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          e.url = t("sell.errUrlScheme");
        }
      } catch {
        e.url = t("sell.errUrlFormat");
      }
    }
    if (isPrivate && !agreePublic) e.agree = t("sell.errNeedsPublic");
    return e;
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    // 서버 액션은 인증·DB 가 붙은 뒤에 연결한다 (OI-45)
    setDone(true);
  }

  return (
    <form onSubmit={submit} className="mt-5 flex flex-col gap-5" noValidate>
      {/* 비공개 안내 (FR-01-A-05) */}
      {isPrivate && (
        <div className="rounded-lg border border-warn bg-warn-bg p-3">
          <p className="flex items-start gap-2 text-sm text-warn">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t("sell.privateNotice")}
          </p>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={agreePublic}
              onChange={(e) => setAgreePublic(e.target.checked)}
              className="mt-0.5"
            />
            <span>{t("sell.privateConfirm")}</span>
          </label>
          {errors.agree && <Err>{errors.agree}</Err>}
        </div>
      )}

      {/* 가격 + 통화. 환산하지 않는다 (D-011) */}
      <div>
        <Label>{t("sell.price")}</Label>
        <div className="mt-1.5 flex gap-2">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            aria-label={t("filter.currency")}
            className="shrink-0 rounded-md border px-3 py-2 text-sm"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="numeric"
            placeholder="0"
            aria-invalid={Boolean(errors.price)}
            className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
          />
        </div>
        {errors.price && <Err>{errors.price}</Err>}
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t("sell.noConversion")}
        </p>
      </div>

      {/* 외부 거래 링크 */}
      <div>
        <Label>{t("sell.dealUrl")}</Label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          type="url"
          inputMode="url"
          placeholder="https://"
          aria-invalid={Boolean(errors.url)}
          className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
        />
        {errors.url && <Err>{errors.url}</Err>}
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t("sell.dealUrlHint")}
        </p>
      </div>

      <button
        type="submit"
        className="rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        {onSale ? t("common.save") : t("sell.convert")}
      </button>

      {done && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          {t("sell.notWired")}
        </p>
      )}
    </form>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-semibold">{children}</span>;
}
function Err({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-destructive">{children}</p>;
}
