"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { updateLanguage } from "@/lib/actions/settings";

/**
 * S-12 언어 설정 (D-003 · D-012).
 *
 * ⚠️ **언어를 바꿔도 유저가 쓴 것은 바뀌지 않는다** (FR-06-A-06, D-003) —
 * 일기·방 이름·소개·속성값은 원문 그대로다. 서비스 UI만 바뀐다.
 * 화면에서도 그렇게 안내한다. 안 그러면 "일기가 번역되겠지" 하고 기대한다.
 *
 * 비로그인 유저의 선택도 보존된다 (FR-05-B-03) — `next-intl` 의
 * `MYHERITAGE_LOCALE` 쿠키가 처리한다 (routing.ts).
 *
 * ## ⚠️ 로그인 유저는 `User.language` 에도 저장해야 한다 (D-180)
 * 초판은 `router.replace(pathname, { locale })` 로 **URL·쿠키만** 바꿨다. 그러면
 * `User.language` 가 **가입 시점 값에 멈춰 있다** — 그 값이 NEW 피드 **언어권
 * 필터의 기준**이라(D-027, FR-03-B-02) 유저가 한국어로 바꿔도 **자기 방이 옛
 * 언어권에 계속 노출**된다. 봇 글 생성 언어(D-149)도 이 값을 본다.
 *
 * 저장 실패는 삼킨다 — 화면 언어 전환 자체는 쿠키로 이미 성립하므로
 * 되돌리면 유저가 더 혼란스럽다. 다음 전환에서 다시 시도된다.
 */
export function LanguageSwitcher({
  current,
  loggedIn,
}: {
  current: string;
  /** 로그인 유저만 `User.language` 를 갖는다 */
  loggedIn: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div>
      <ul className="rounded-lg border">
        {routing.locales.map((l) => (
          <li key={l} className="border-b last:border-b-0">
            <button
              type="button"
              onClick={() => {
                // 화면 전환이 먼저다 — 저장은 뒤에서 따라간다 (위 주석)
                router.replace(pathname, { locale: l });
                if (loggedIn) void updateLanguage({ language: l });
              }}
              className="flex w-full items-center justify-between px-4 py-3.5 text-sm hover:bg-accent"
            >
              {/* 언어 이름은 그 언어로 쓴다 — 못 읽는 언어로 적으면 못 찾는다 */}
              <span className={l === current ? "font-bold" : ""}>
                {{ ko: "한국어", ja: "日本語", en: "English" }[l]}
              </span>
              {l === current && <Check aria-hidden className="size-4" />}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        {t("settings.languageHint")}
      </p>
    </div>
  );
}
