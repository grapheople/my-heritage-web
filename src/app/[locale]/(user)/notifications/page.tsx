import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/domain/empty-state";
import { NotificationList } from "@/components/domain/notification-list";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { DEV_NOTIFICATIONS } from "@/lib/dev-fixture";

/**
 * S-22 알림함 (D-087).
 *
 * ## 이 화면이 없으면 D-066 이 무너진다
 * 푸시를 전부 없앴으므로(D-059) **인앱 알림함이 유일한 전달 경로다.**
 * D-066 이 "제재 시 로그인을 막지 않는다"고 한 근거가 "알림이 앱 안에 있어서
 * 막으면 사유를 알릴 수 없다"였는데, 그 앱 안 알림이 존재하지 않았다.
 *
 * 알림 4종은 모두 **유저가 서비스에 없을 때 발생**한다 — 브랜드 승인/반려,
 * 신고 처리 결과, 제재, 도감 병합.
 *
 * 색인 대상이 아니다 — 기본 noindex 이고 `robots.txt` 에서도 제외했다.
 */
export default async function NotificationsPage({
  params,
}: PageProps<"/[locale]/notifications">) {
  const { locale } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  if (!viewer) {
    redirect({ href: { pathname: "/login", query: { next: "/notifications" } }, locale });
    return null;
  }

  // 최신순 (FR-08-A-04)
  const items = DEV_NOTIFICATIONS;

  return (
    <div>
      <header className="border-b px-4 py-4 lg:px-0">
        <h1 className="text-lg font-bold tracking-tight">{t("nav.notifications")}</h1>
        {/* 알림 설정이 없다는 것을 밝힌다 (FR-08-A-08) */}
        <p className="mt-1 text-xs text-muted-foreground">{t("notif.allOn")}</p>
      </header>
      {items.length === 0 ? (
        <EmptyState title={t("notif.empty")} />
      ) : (
        <NotificationList items={items} />
      )}
    </div>
  );
}
