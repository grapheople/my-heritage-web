import { Bell } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { unreadCount } from "@/lib/data/notification";

/**
 * 알림함 진입점 (FR-08-A-02·03·07).
 *
 * - `sm`·`md`: 화면 상단 슬림 헤더 우측
 * - `lg`: 상단 네비 우측
 * - **비로그인에게는 렌더하지 않는다** (FR-08-A-07) — 호출부가 판정한다
 *
 * 미읽음 뱃지는 서버에서 센다 — 개수가 유저별이라 캐시할 수 없고,
 * 클라이언트 fetch 로 하면 첫 렌더에 뱃지가 없다가 튀어나온다.
 */
export async function NotificationBell() {
  const t = await getTranslations("nav");
  // 비로그인에게는 호출부가 이 컴포넌트를 렌더하지 않는다 (FR-08-A-07).
  // 그래도 방어적으로 0 을 낸다 — 뱃지가 없는 상태다
  const viewer = await getViewer();
  const unread = viewer ? await unreadCount(viewer) : 0;

  return (
    <Link
      href="/notifications"
      aria-label={t("notifications")}
      className="relative inline-flex size-11 items-center justify-center text-muted-foreground hover:text-foreground"
    >
      <Bell className="size-5" aria-hidden />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute top-2.5 right-2.5 size-2 rounded-full bg-sale ring-2 ring-background"
        />
      )}
      <span className="sr-only">{unread > 0 ? `${unread}` : ""}</span>
    </Link>
  );
}
