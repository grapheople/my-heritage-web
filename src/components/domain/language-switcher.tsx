"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/**
 * S-12 언어 설정 (D-003 · D-012).
 *
 * ⚠️ **언어를 바꿔도 유저가 쓴 것은 바뀌지 않는다** (FR-06-A-06, D-003) —
 * 일기·방 이름·소개·속성값은 원문 그대로다. 서비스 UI만 바뀐다.
 * 화면에서도 그렇게 안내한다. 안 그러면 "일기가 번역되겠지" 하고 기대한다.
 *
 * 비로그인 유저의 선택도 보존된다 (FR-05-B-03) — `next-intl` 의
 * `MYHERITAGE_LOCALE` 쿠키가 처리한다 (routing.ts).
 */
export function LanguageSwitcher({ current }: { current: string }) {
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
              onClick={() => router.replace(pathname, { locale: l })}
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
