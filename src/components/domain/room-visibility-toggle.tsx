"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setRoomVisibility } from "@/lib/actions/settings";

/**
 * 방 공개/비공개 전환 (D-019 · D-071).
 *
 * ⚠️ **양방향 모두 사전 안내가 필요하다.**
 *
 * | 전환 | 안내 | 근거 |
 * |---|---|---|
 * | 공개 → 비공개 | 판매중 N건이 **마켓에서 내려간다** | FR-02-A-05 |
 * | 비공개 → 공개 | 판매중 N건이 **자동으로 다시 노출된다** | D-071, FR-02-A-07 |
 *
 * 복귀 시 **가격·통화·링크를 재입력받지 않는다** (FR-02-A-08, 원칙 1) —
 * 값을 보존해두기 때문이다.
 *
 * 방이 비공개면 **개별 아이템의 공개 설정을 무시한다** (FR-02-A-04) —
 * 두 축이 독립 계산되면 유저가 자기 노출 상태를 예측할 수 없다.
 */
export function RoomVisibilityToggle({
  initialPublic,
  onSaleCount,
}: {
  initialPublic: boolean;
  onSaleCount: number;
}) {
  const t = useTranslations();
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [pending, setPending] = useState<boolean | null>(null);
  const [saving, startTransition] = useTransition();

  const next = pending;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("settings.roomVisibility")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isPublic ? t("settings.roomPublicDesc") : t("settings.roomPrivateDesc")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          onClick={() => setPending(!isPublic)}
          className={
            isPublic
              ? "h-6 w-11 shrink-0 rounded-full bg-primary p-0.5 transition-colors"
              : "h-6 w-11 shrink-0 rounded-full bg-muted p-0.5 transition-colors"
          }
        >
          <span
            className={
              isPublic
                ? "block size-5 translate-x-5 rounded-full bg-background transition-transform"
                : "block size-5 rounded-full bg-background transition-transform"
            }
          />
        </button>
      </div>

      {/* 사전 안내 — 확인 전에는 바뀌지 않는다 */}
      {next !== null && (
        <div className="mt-3 rounded-lg border border-warn bg-warn-bg p-3">
          <p className="flex items-start gap-2 text-sm text-warn">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            {next === false
              ? /* 공개 → 비공개 (FR-02-A-05) */
                t("settings.goPrivateWarn", { count: onSaleCount })
              : /* 비공개 → 공개. 재입력 없이 자동 복귀 (D-071, FR-02-A-08) */
                t("settings.goPublicWarn", { count: onSaleCount })}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                startTransition(async () => {
                  // ⚠️ 아이템의 판매 상태는 **건드리지 않는다.** 방 상태만
                  // 바꾸고 노출 여부는 조회가 판정한다 — 그래서 공개로
                  // 돌아오면 판매중이 자동 복귀한다 (D-071, FR-02-A-06·08)
                  const res = await setRoomVisibility(next ? "PUBLIC" : "PRIVATE");
                  if (res.ok) setIsPublic(next);
                  setPending(null);
                });
              }}
              disabled={saving}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
            >
              {t("common.confirm")}
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
