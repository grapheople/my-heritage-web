import { getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { getActiveSanction } from "@/lib/data/settings";

/**
 * S-21 제재 안내 (D-066 · D-067 · D-088).
 *
 * ## 로그인을 막지 않는 이유가 이 화면이다
 * 푸시를 없앴으므로(D-059) **알림이 인앱에만 있다.** 로그인을 막으면 유저는
 * 자신이 왜 막혔는지 영원히 알 수 없다. 그래서 정지 상태에서도 로그인은
 * 허용하고(FR-07-C-01) 자기 마이룸·설정만 접근하게 한다 (FR-07-C-02).
 *
 * | 표시 항목 | 근거 |
 * |---|---|
 * | 단계 · 사유 · 기간 · 이의 제기 경로 | FR-07-C-07 |
 * | 문의 이메일 | FR-07-D-03, D-067 |
 * | 정지 중 탈퇴 허용 | FR-07-C-08 |
 *
 * **인앱 이의 제기 플로우와 어드민 재심 큐는 제공하지 않는다** (FR-07-D-04) —
 * 이메일 채널 하나로 받는다.
 *
 * 노출 규칙은 `SanctionNotice`가 담당한다 — **세션당 1회 + 제재 대상 행동
 * 시도 시 재노출** (D-088, FR-07-C-09·10).
 */
export default async function SuspendedPage({
  params,
}: PageProps<"/[locale]/suspended">) {
  const { locale } = await params;
  const t = await getTranslations();
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

  // ⚠️ 제재 중에도 로그인은 된다 (D-066). 로그인 자체가 없으면 볼 화면이 아니다
  const viewer = await getViewer();
  const s = viewer ? await getActiveSanction(viewer) : null;
  if (!s) {
    // 제재가 없거나 이미 만료·해제됐다 — 안내를 남겨둘 이유가 없다
    redirect({ href: "/", locale });
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-md px-6 py-12">
      <p className="text-sm text-muted-foreground">{t("sanction.noticeTitle")}</p>
      <h1 className="mt-1 text-xl font-bold tracking-tight">
        {t(`sanction.${s.level === "WARNING" ? "warning" : s.level === "SUSPENDED" ? "suspended" : "banned"}`)}
      </h1>

      <dl className="mt-5 flex flex-col gap-3 rounded-lg border p-4 text-sm">
        <div className="flex gap-4">
          <dt className="w-16 shrink-0 text-muted-foreground">{t("sanction.reason")}</dt>
          {/* 사유는 enum 이라 **유저 언어로 번역된다** (D-103, OI-56 해소).
              상세(detail)는 어드민이 쓴 원문이라 번역되지 않는다 — `OTHER`
              일 때만 실질적으로 노출된다 */}
          <dd>
            {t(`sanction.reasonCode.${s.reasonCode}`)}
            {s.detail && (
              <span className="mt-0.5 block text-muted-foreground">{s.detail}</span>
            )}
          </dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-16 shrink-0 text-muted-foreground">{t("sanction.period")}</dt>
          {/* 영구 정지는 기간이 없다 */}
          <dd>
            {s.expiresAt
              ? t("sanction.until", { date: s.expiresAt })
              : t("sanction.permanent")}
          </dd>
        </div>
      </dl>

      <section className="mt-5">
        <h2 className="text-sm font-bold">{t("sanction.blockedTitle")}</h2>
        {/* FR-07-C-02~05 — 무엇이 막혔는지 구체적으로 */}
        <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
          <li>· {t("sanction.blocked1")}</li>
          <li>· {t("sanction.blocked2")}</li>
          <li>· {t("sanction.blocked3")}</li>
        </ul>
      </section>

      {/* 이의 제기 = 이메일 하나. 인앱 플로우 없음 (FR-07-D-04) */}
      <section className="mt-6 rounded-lg border p-4">
        <h2 className="text-sm font-bold">{t("sanction.appealTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("sanction.appealBody")}</p>
        {email ? (
          <a href={`mailto:${email}`} className="mt-3 block text-sm font-semibold underline">
            {email}
          </a>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t("contact.notReady")}</p>
        )}
      </section>

      <div className="mt-6 flex flex-col gap-2">
        {/* 자기 마이룸·설정은 접근 가능 (FR-07-C-02) */}
        <Link
          href="/me"
          className="rounded-lg border py-3 text-center text-sm font-semibold hover:bg-accent"
        >
          {t("nav.myRoom")}
        </Link>
        {/* 정지 중 탈퇴 허용 (FR-07-C-08) */}
        <Link
          href="/me/settings"
          className="py-2 text-center text-xs text-muted-foreground underline"
        >
          {t("sanction.leaveService")}
        </Link>
      </div>
    </main>
  );
}
