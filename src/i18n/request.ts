import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { fallbackChain, routing, type Locale } from "./routing";

type Messages = Record<string, unknown>;

async function load(locale: Locale): Promise<Messages> {
  return (await import(`../../messages/${locale}.json`)).default as Messages;
}

function isPlainObject(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `override`가 이기고, 빠진 key만 `base`에서 채운다. */
function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    out[key] =
      isPlainObject(existing) && isPlainObject(value)
        ? deepMerge(existing, value)
        : value;
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  // fallback: 요청 언어 → en → ko (D-012, policies/i18n §4)
  // key 노출·빈 문자열 렌더를 금지하므로 런타임 fallback 대신 메시지를 병합한다.
  const chain = [...fallbackChain, locale];
  const messages = (
    await Promise.all(chain.map((l) => load(l)))
  ).reduce<Messages>((acc, m) => deepMerge(acc, m), {});

  return {
    locale,
    messages,
    // ko/ja/en 모두 LTR. 시간대는 유저 설정을 서버에서 주입할 때까지 UTC 고정 (D-056)
    timeZone: "UTC",
    onError(error) {
      // 3개 언어 전부에 없는 key = 배포 결함. QA에서 차단한다 (policies/i18n §4)
      if (process.env.NODE_ENV !== "production") throw error;
      console.error("[i18n]", error);
    },
    getMessageFallback() {
      // i18n key를 화면에 노출하지 않는다. 빈 문자열도 금지 (FR-06-A-05)
      return "—";
    },
  };
});
