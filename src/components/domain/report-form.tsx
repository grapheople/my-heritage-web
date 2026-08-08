"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { submitReport } from "@/lib/actions/social";
import { REPORT_REASONS, type ReportTarget } from "@/lib/constants";

/**
 * S-15 신고 폼 (D-029 · D-035 · D-052).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 대상: 아이템·일기·방·도감·**외부 링크** | FR-05-A-01, D-040 |
 * | 사유는 목록에서 선택 — **금지품목 6종** + 사기·피싱 + 부적절 + 정보 오류 | FR-05-A-02 |
 * | 어드민 처리 큐에 적재 | FR-05-A-03 |
 * | 처리 결과를 **인앱으로** 알린다 (푸시 아님) | FR-05-A-08, D-059 |
 *
 * ⚠️ **접수해도 대상 콘텐츠를 자동으로 숨기지 않는다** (FR-05-A-04).
 * 바로 숨기면 **경쟁 판매자가 신고만으로 남의 매물을 내릴 수 있다.**
 * 그래서 화면에서도 "바로 내려가지 않는다"를 알린다 — 안 그러면 신고자가
 * 안 먹혔다고 생각하고 반복 신고한다.
 *
 * **금지품목은 자동 판정하지 않는다** (FR-06-A-04) — 신고 기반 사후 조치다.
 */
export function ReportForm({
  target,
  targetId,
}: {
  target: ReportTarget;
  targetId?: string;
}) {
  const t = useTranslations();
  const [reason, setReason] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-sm font-semibold">{t("report.submitted")}</p>
        {/* 결과는 인앱 알림으로 온다 (FR-05-A-08, D-087) */}
        <p className="mt-2 text-sm text-muted-foreground">
          {t("report.resultNotice")}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!reason) return setError(t("report.errNoReason"));
        if (!targetId) return setError(t("report.errNoTarget"));
        setError("");
        startTransition(async () => {
          // 어드민 큐에 적재된다. **콘텐츠는 자동으로 숨겨지지 않는다**
          // (FR-05-A-03·04) — 결과는 인앱 알림으로 온다 (FR-05-A-08)
          const res = await submitReport({ target, targetId, reason, detail });
          if (res.ok) setDone(true);
          else setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
        });
      }}
      className="flex flex-col gap-5"
    >
      <p className="text-sm text-muted-foreground">
        {t(`report.target.${target}`)}
        {targetId && <span className="ml-1 font-mono text-xs">{targetId}</span>}
      </p>

      <fieldset>
        <legend className="text-sm font-semibold">{t("report.reasonLabel")}</legend>
        <ul className="mt-2 rounded-lg border">
          {REPORT_REASONS.map((r) => (
            <li key={r} className="border-b last:border-b-0">
              <label className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm hover:bg-accent">
                <input
                  type="radio" name="reason" value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                />
                {t(`report.reason.${r}`)}
              </label>
            </li>
          ))}
        </ul>
        {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
      </fieldset>

      <div>
        <label className="text-sm font-semibold" htmlFor="report-detail">
          {t("report.detailLabel")}{" "}
          <span className="font-normal text-muted-foreground">
            {t("diary.optional")}
          </span>
        </label>
        <textarea
          id="report-detail" rows={4} value={detail}
          onChange={(e) => setDetail(e.target.value)}
          className="mt-1.5 w-full resize-y rounded-md border px-3 py-2 text-sm"
        />
      </div>

      {/* ⚠️ 어뷰징 방지 — 바로 안 내려간다는 것을 미리 밝힌다 (FR-05-A-04) */}
      <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        {t("report.noAutoHide")}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
      >
        {t("report.submit")}
      </button>
    </form>
  );
}
