import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import {
  DAILY_EXP_CAP, EXP_RULES, expHistory, expReasonKey, levelProgressOf,
  levelTableRows,
} from "@/lib/data/level";
import { formatNumber, userLocalDate } from "@/lib/format";

/**
 * S-14 레벨 상세 (경험치 내역).
 *
 * ## 이 화면의 핵심은 "오늘 아직 안 한 것"이다
 * 경험치는 보상이 아니라 **리듬**이다 (원칙 7). 각 행동은 **1일 1회**이므로
 * (D-026) "오늘 뭘 더 할 수 있나"를 보여주는 것이 이 화면의 목적이다.
 * 순위표·경쟁 요소를 넣지 않는다.
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 로그인 10 · 아이템 30 · 일기 20, 각 1일 1회 | D-026, FR-01-A-01~04 |
 * | 1일 상한 60 | D-026, FR-01-A-07 |
 * | 1일 경계는 **유저 타임존** 기준 | D-056, FR-01-B-01 |
 * | 레벨은 하락하지 않는다 (단조 증가) | D-058, FR-01-C-02 |
 * | **Lv.10 은 다음 레벨 진행률을 표시하지 않는다** | D-057, FR-02-A-03 |
 * | Lv.10 이후에도 누적 경험치는 계속 표시 | D-057, FR-02-A-04 |
 */
export default async function LevelPage({
  params,
}: PageProps<"/[locale]/me/level">) {
  const { locale } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  if (!viewer) {
    redirect({ href: { pathname: "/login", query: { next: "/me/level" } }, locale });
    return null;
  }

  // ⚠️ "오늘"의 경계는 **유저 타임존**이다 (D-056). 서버 UTC 날짜로 비교하면
  // 자정 근처에서 "오늘 이미 받았다"가 어긋난다
  const today = userLocalDate(viewer.timezone ?? "UTC");
  const [p, exp, levels] = await Promise.all([
    levelProgressOf(viewer.userId),
    expHistory(viewer.userId, today),
    levelTableRows(),
  ]);
  const todayTotal = EXP_RULES
    .filter((r) => exp.todayEarned.includes(r.reason))
    .reduce((n, r) => n + r.amount, 0);

  return (
    <div className="px-4 py-5 lg:px-0">
      <header>
        <p className="text-sm text-muted-foreground">{t("level.current")}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          {t("myRoom.level", { level: p.level })}
          {p.isMax && (
            <span className="ml-2 text-sm font-semibold text-muted-foreground">
              {t("level.max")}
            </span>
          )}
        </h1>

        {/* Lv.10 은 진행률을 내지 않는다 (D-057) */}
        {!p.isMax && (
          <>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round((p.inLevel / p.span) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t("level.toNext", { exp: formatNumber(p.toNext) })}
            </p>
          </>
        )}
        {/* 누적은 Lv.10 이후에도 계속 표시 (FR-02-A-04) */}
        <p className="mt-2 text-sm">
          {t("level.total", { exp: formatNumber(p.total) })}
        </p>
      </header>

      {/* ⚠️ 이 화면의 핵심 — 오늘 안 한 것 */}
      <section className="mt-6 rounded-lg border p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold">{t("level.today")}</h2>
          <span className="text-xs text-muted-foreground">
            {todayTotal} / {DAILY_EXP_CAP}
          </span>
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {EXP_RULES.map((r) => {
            const done = exp.todayEarned.includes(r.reason);
            return (
              <li key={r.reason} className="flex items-center justify-between text-sm">
                <span className={done ? "text-muted-foreground line-through" : ""}>
                  {t(`level.reason.${r.key}`)}
                </span>
                <span
                  className={
                    done ? "text-xs text-muted-foreground" : "text-xs font-bold text-sale"
                  }
                >
                  {done ? t("level.done") : `+${r.amount}`}
                </span>
              </li>
            );
          })}
        </ul>
        {/* 1일 경계 기준을 밝힌다 (D-056) */}
        <p className="mt-3 text-xs text-muted-foreground">
          {t("level.dayBoundary")}
        </p>
      </section>

      {/* 최근 내역 */}
      <section className="mt-6">
        <h2 className="text-sm font-bold">{t("level.history")}</h2>
        <ul className="mt-2 divide-y">
          {exp.logs.map((log) => (
            <li key={log.id} className="flex items-center justify-between py-3 text-sm">
              <span>
                {t(`level.reason.${expReasonKey(log.reason)}`)}
                <span className="ml-2 text-xs text-muted-foreground">
                  {log.localDate}
                </span>
              </span>
              <span className="text-sm font-semibold">+{log.amount}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 레벨 테이블 */}
      <section className="mt-6">
        <h2 className="text-sm font-bold">{t("level.table")}</h2>
        <ul className="mt-2 divide-y">
          {levels.map((l) => (
            <li
              key={l.level}
              className={
                l.level === p.level
                  ? "flex justify-between bg-accent px-2 py-2 text-sm font-bold"
                  : "flex justify-between px-2 py-2 text-sm text-muted-foreground"
              }
            >
              <span>{t("myRoom.level", { level: l.level })}</span>
              <span>{formatNumber(l.requiredExp)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
