import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { ENABLED_PROVIDERS, signIn } from "@/lib/auth/config";
import { getViewer } from "@/lib/auth/viewer";
import { Link, redirect } from "@/i18n/navigation";
import { SIGNUP_LOCALE_COOKIE } from "@/i18n/routing";

/**
 * S-13 로그인.
 *
 * **Google · Apple 소셜만** (D-021, FR-05-A-01).
 * **이메일/비밀번호 가입은 제공하지 않는다** (FR-05-A-02) — 입력 필드가 없는 게
 * 정상이다.
 *
 * Auth.js 기본 로그인 화면을 쓰지 않는다 — UI 문구가 3개 언어여야 한다 (D-003).
 * 탭바가 붙지 않는다 (`(user)` 그룹 밖).
 */
export default async function LoginPage({
  params,
  searchParams,
}: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  const t = await getTranslations();
  const sp = await searchParams;

  // 이미 로그인했으면 되돌린다
  if (await getViewer()) {
    redirect({ href: "/", locale });
    return null;
  }

  const next = typeof sp.next === "string" ? sp.next : "/";

  async function login(provider: "google" | "apple") {
    "use server";
    // ⚠️ 가입 시점 언어를 여기서 확정한다 (D-120). 이 화면은 URL 에서 로케일을
    // 확실히 알지만, OAuth 콜백은 구글에서 돌아오는 별개 요청이라 그 정보가
    // 없다. next-intl 쿠키에 기댔더니 콜백 시점에 없어서 전원 `en` 으로
    // 기록됐다 — 오류는 안 나고 피드 언어권 필터만 조용히 틀린다 (D-027)
    (await cookies()).set(SIGNUP_LOCALE_COOKIE, locale, {
      maxAge: 60 * 10, // OAuth 왕복용. 오래 둘 이유가 없다
      httpOnly: true,
      sameSite: "lax", // 구글에서 돌아오는 최상위 이동에 실려야 한다
      path: "/",
    });
    await signIn(provider, { redirectTo: next });
  }

  // ⚠️ 자격증명이 있는 provider 만 그린다 (D-119). 버튼만 그려두면 누르는
  // 순간 에러 화면이고, 유저는 "이 서비스는 로그인이 안 된다"로 읽는다
  const BUTTONS = {
    google: { label: "auth.loginWithGoogle", className: "w-full rounded-lg border py-3 text-sm font-semibold hover:bg-accent" },
    apple: { label: "auth.loginWithApple", className: "w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90" },
  } as const;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6 py-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("app.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("auth.loginRequired")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {ENABLED_PROVIDERS.map((p) => (
          <form key={p} action={login.bind(null, p)}>
            <button type="submit" className={BUTTONS[p].className}>
              {t(BUTTONS[p].label)}
            </button>
          </form>
        ))}
        {ENABLED_PROVIDERS.length === 0 && (
          <p className="rounded-lg border border-warn bg-warn-bg p-3 text-sm text-warn">
            로그인 수단이 아직 설정되지 않았습니다.
          </p>
        )}
      </div>

      {/* 비로그인도 열람은 가능하다 (FR-05-B-01) — 막다른 길로 두지 않는다 */}
      <Link
        href="/"
        className="text-center text-sm text-muted-foreground underline"
      >
        {t("auth.browseWithoutLogin")}
      </Link>
    </main>
  );
}
