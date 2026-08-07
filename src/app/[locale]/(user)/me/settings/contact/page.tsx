import { getTranslations } from "next-intl/server";

/**
 * S-20 문의 안내 (D-067).
 *
 * 검토 중 **문의 채널 자체가 정의되지 않은 것**을 발견해 신설된 화면이다.
 * 제재 안내(S-21)에서도 이 주소를 노출한다 (FR-07-D-03).
 *
 * ⚠️ **인앱 이의 제기 플로우와 어드민 재심 큐는 제공하지 않는다**
 * (FR-07-D-04, D-067) — 이메일 채널 하나로 받는다.
 *
 * 운영 주체·응답 SLA 는 미정이다 (OI-32). 그래서 화면에서 응답 시간을
 * 약속하지 않는다 — 지킬 수 없는 약속을 UI 에 넣지 않는다.
 */
export default async function ContactPage() {
  const t = await getTranslations();
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

  return (
    <div className="px-4 py-5 lg:px-0">
      <h1 className="text-lg font-bold tracking-tight">{t("settings.contact")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("contact.body")}</p>

      {email ? (
        <a
          href={`mailto:${email}`}
          className="mt-4 block rounded-lg border px-4 py-3 text-center text-sm font-semibold hover:bg-accent"
        >
          {email}
        </a>
      ) : (
        /* 주소가 아직 없다 (C-1 운영 액션 대기). 빈 화면 대신 상태를 밝힌다 */
        <p className="mt-4 rounded-lg border border-dashed px-4 py-3 text-center text-sm text-muted-foreground">
          {t("contact.notReady")}
        </p>
      )}

      <ul className="mt-6 flex flex-col gap-2 text-sm text-muted-foreground">
        <li>· {t("contact.scope1")}</li>
        <li>· {t("contact.scope2")}</li>
      </ul>
    </div>
  );
}
