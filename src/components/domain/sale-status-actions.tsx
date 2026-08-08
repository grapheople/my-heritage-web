"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { cancelSale, markSold, undoSold } from "@/lib/actions/sell";

/**
 * 판매 상태 전환 (S-05 소유자 액션, market F-01 C).
 *
 * | 전이 | 조건 | 근거 |
 * |---|---|---|
 * | 판매중 → 전시중 | 조건 없음. **값은 보존** | FR-01-C-01·02 |
 * | 판매중 → 판매완료 | **유저 자기 신고** | D-001, FR-01-C-03 |
 * | 판매완료 → 전시중 | 오처리 되돌리기 | FR-01-C-06 |
 *
 * ## ⚠️ 서버는 실제 성사를 모른다 (D-001)
 * 거래가 외부에서 일어나므로 판매완료는 **유저가 직접** 누른다. 그래서
 * **되돌리기를 반드시 열어둔다** — 잘못 눌렀을 때 복구할 방법이 없으면
 * 아이템이 "떠난 아이템"에 영영 갇힌다.
 *
 * 판매완료는 **확인을 한 번 받는다.** 방 진열에서 빠지고 도감 보유자 수에서도
 * 제외되는(D-023) 무거운 전이인데, 버튼 한 번으로 일어나면 실수가 잦다.
 */
export function SaleStatusActions({
  itemId,
  saleStatus,
}: {
  itemId: string;
  saleStatus: "DISPLAYED" | "ON_SALE" | "SOLD";
}) {
  const t = useTranslations();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; formError?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.formError ?? "");
      else setConfirming(false);
    });
  }

  if (saleStatus === "DISPLAYED") return null;

  return (
    <div className="flex flex-col gap-2">
      {saleStatus === "ON_SALE" && !confirming && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(true)}
            className="flex-1 rounded-lg border py-3 text-sm font-semibold hover:bg-accent disabled:opacity-40"
          >
            {t("sell.markSold")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => cancelSale(itemId))}
            className="flex-1 rounded-lg border py-3 text-sm hover:bg-accent disabled:opacity-40"
          >
            {t("sell.cancel")}
          </button>
        </div>
      )}

      {/* 판매완료 확인 — 방 진열·도감에서 빠지는 무거운 전이다 (D-023) */}
      {confirming && (
        <div className="rounded-lg border border-warn bg-warn-bg p-3">
          <p className="text-sm text-warn">{t("sell.markSoldConfirm")}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => markSold(itemId))}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {t("common.confirm")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* 되돌리기 — 서버가 성사를 모르므로 반드시 열어둔다 (FR-01-C-06) */}
      {saleStatus === "SOLD" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => undoSold(itemId))}
          className="rounded-lg border py-3 text-sm hover:bg-accent disabled:opacity-40"
        >
          {t("sell.undoSold")}
        </button>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
