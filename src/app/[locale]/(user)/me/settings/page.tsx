import { getTranslations } from "next-intl/server";
import { RoomVisibilityToggle } from "@/components/domain/room-visibility-toggle";
import { Link, redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { DEV_PROFILE_SETTINGS } from "@/lib/dev-fixture";

/**
 * S-11 프로필 설정.
 *
 * 방 이름·소개는 **유저가 쓴 것이라 번역하지 않는다** (FR-01-C-02).
 * **방 이름은 서비스 내 유일값을 요구하지 않는다** (FR-05-A-06) — 컬렉터 방은
 * 계정 핸들이 아니라 공간 이름이다.
 */
export default async function ProfileSettingsPage({
  params,
}: PageProps<"/[locale]/me/settings">) {
  const { locale } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  if (!viewer) {
    redirect({ href: { pathname: "/login", query: { next: "/me/settings" } }, locale });
    return null;
  }
  const p = DEV_PROFILE_SETTINGS;

  return (
    <div className="px-4 py-5 lg:px-0">
      <h1 className="text-lg font-bold tracking-tight">{t("settings.title")}</h1>

      <section className="mt-5 flex flex-col gap-4">
        <div>
          <label className="text-sm font-semibold" htmlFor="room-name">
            {t("settings.roomName")}
          </label>
          <input
            id="room-name" defaultValue={p.roomName}
            className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
          />
          {/* 유일값이 아니다 (FR-05-A-06) */}
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t("settings.roomNameHint")}
          </p>
        </div>

        <div>
          <label className="text-sm font-semibold" htmlFor="bio">
            {t("settings.bio")}
          </label>
          <textarea
            id="bio" defaultValue={p.bio} rows={3}
            className="mt-1.5 w-full resize-y rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </section>

      <section className="mt-6 border-t pt-5">
        <RoomVisibilityToggle
          initialPublic={p.roomPublic}
          onSaleCount={p.onSaleCount}
        />
      </section>

      <nav className="mt-6 border-t pt-2">
        {[
          { href: "/me/settings/language", label: t("settings.language") },
          { href: "/me/settings/blocks", label: t("settings.blocks") },
          { href: "/me/settings/contact", label: t("settings.contact") },
        ].map((row) => (
          <Link
            key={row.href} href={row.href}
            className="flex items-center justify-between border-b py-3.5 text-sm hover:bg-accent"
          >
            {row.label}
            <span aria-hidden className="text-muted-foreground">›</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
