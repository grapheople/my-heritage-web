import { getTranslations } from "next-intl/server";
import { CATEGORY_KEYS } from "@/lib/categories";
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
    /*
      ⚠️ **로그인한 사람을 `/login` 으로 보내지 않는다** (D-204). `/login` 은
      뷰어가 있으면 홈으로 되돌리므로, 여기서 보내면 **마이룸 → 설정 → 로그인
      → 홈** 고리가 된다. 실제로 그 증상이 관측됐다.

      `getViewer()` 가 DB 로 유저 실재를 확인하게 되면서 이 분기는 사실상
      도달 불가가 됐지만(유저가 없으면 위 `!viewer` 에서 걸린다), **방향이
      틀린 리다이렉트를 남겨두지 않는다.** 온보딩(S-24)이 이 상태의 목적지다.
    */
    redirect({ href: "/onboarding", locale });
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
          CATEGORY_KEYS.map(
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
