import { getTranslations } from "next-intl/server";
import { ProfileForm } from "@/components/domain/profile-form";
import { RoomVisibilityToggle } from "@/components/domain/room-visibility-toggle";
import { Link, redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { ROOM_NAME_MAX } from "@/lib/profile";
import { getProfileSettings } from "@/lib/data/settings";

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
  const p = await getProfileSettings(viewer);
  if (!p) {
    // 방이 없는 신규 가입 — 전용 온보딩 화면이 없다 (OI-52)
    redirect({ href: "/login", locale });
    return null;
  }

  return (
    <div className="px-4 py-5 lg:px-0">
      <h1 className="text-lg font-bold tracking-tight">{t("settings.title")}</h1>

      <ProfileForm
        initial={{
          roomName: p.roomName,
          bio: p.bio,
          imageUrl: p.imageUrl,
          preferredCategories: p.preferredCategories,
        }}
        categoryLabels={Object.fromEntries(
          ["watch", "shoes", "bicycle", "apparel", "camping", "deskterior"].map(
            (k) => [k, t(`category.${k}`)],
          ),
        )}
        roomNameMax={ROOM_NAME_MAX}
        labels={{
          roomName: t("settings.roomName"),
          roomNameHint: t("settings.roomNameHint"),
          bio: t("settings.bio"),
        }}
      />

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
