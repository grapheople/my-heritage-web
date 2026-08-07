"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useSyncExternalStore } from "react";
import { Link } from "@/i18n/navigation";

/**
 * 제재 안내 오버레이 — 노출 규칙 담당 (D-088, FR-07-C-09·10).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | **세션당 1회** 표시하고 닫을 수 있다 | FR-07-C-09 |
 * | 제재로 막힌 행동을 시도하면 **다시 표시** | FR-07-C-10 |
 *
 * 매번 강제하면 정지 기간 내내 모든 진입을 막아 불필요하게 적대적이고,
 * 최초 1회만 하면 기간이 길 때 유저가 왜 막혔는지 잊는다 (D-088).
 *
 * `sessionStorage`를 쓰는 이유: **탭을 닫으면 다시 뜬다.** `localStorage`면
 * 한 번 닫은 뒤 영영 안 보여서 "최초 1회만"과 같아진다.
 */
const KEY = "sanction-notice-dismissed";

/**
 * `sessionStorage` 는 외부 스토어다 — 렌더 중에 읽으면 순수하지 않고,
 * effect 에서 setState 하면 계단식 렌더가 된다. `useSyncExternalStore` 가
 * 이 용도의 API 다. 서버 스냅샷은 `true`(=이미 닫힘)로 둬서 SSR 에서
 * 오버레이를 내지 않는다 — 하이드레이션 불일치를 피한다.
 */
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return sessionStorage.getItem(KEY) === "1";
}
function getServerSnapshot() {
  return true;
}
function markDismissed() {
  sessionStorage.setItem(KEY, "1");
  for (const cb of listeners) cb();
}

export function SanctionNotice({
  level,
  until,
  /** 제재 대상 행동을 시도해 다시 띄우는 경우 — 세션 플래그를 무시한다 */
  forceShow = false,
}: {
  level: "WARNING" | "SUSPENDED" | "BANNED";
  until?: string;
  forceShow?: boolean;
}) {
  const t = useTranslations();
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const dismiss = useCallback(() => markDismissed(), []);

  const open = forceShow || !dismissed;
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div className="w-full max-w-sm rounded-xl border bg-background p-5 shadow-lg">
        <p className="flex items-start gap-2 text-sm font-bold text-warn">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t(`sanction.${level === "WARNING" ? "warning" : level === "SUSPENDED" ? "suspended" : "banned"}`)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {until ? t("sanction.until", { date: until }) : t("sanction.permanent")}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Link
            href="/suspended"
            className="rounded-lg bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground"
          >
            {t("sanction.seeDetail")}
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="py-2 text-sm text-muted-foreground"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
