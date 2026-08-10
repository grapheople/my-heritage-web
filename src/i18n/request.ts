import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import en from "../../messages/en.json";
import ja from "../../messages/ja.json";
import ko from "../../messages/ko.json";
import { fallbackChain, routing, type Locale } from "./routing";

type Messages = Record<string, unknown>;

/**
 * 메시지는 **정적 import** 다 (D-161).
 *
 * ## ⚠️ 템플릿 동적 import 를 쓰지 않는다
 * 초판은 `await import(`../../messages/${locale}.json`)` 이었다. 경로가 런타임에
 * 결정되면 **dev 모듈 그래프가 파일을 추적하지 못해** JSON 을 고쳐도 반영되지
 * 않는다. 그것만이면 "재시작하면 된다"로 끝나지만, **로케일별로 갱신 여부가
 * 갈리는 것**이 실제 사고였다:
 *
 * `fallbackChain` 이 `["ko","en"]` 이라 merge 순서가 **ko → en → 요청 로케일**
 * 이다. `en.json` 은 갱신되고 `ko.json` 은 캐시된 상태가 되면, ko 에 없고 en 에
 * 있는 키는 **en 값이 이겨서 한국어 화면에 영어가 나온다.** 실제로 `nav.codex`
 * 가 그렇게 "Codex" 로 보였고, 클라이언트 쪽에서는 `MISSING_MESSAGE` 가 났다.
 *
 * ## 비용은 없다
 * 3개 언어는 고정이고(D-003), fallback merge 때문에 **한 요청에서 이미 2~3개를
 * 전부 읽는다.** 정적으로 들고 있어도 늘어나는 것이 없다.
 */
const BUNDLES: Record<Locale, Messages> = {
  ko: ko as Messages,
  ja: ja as Messages,
  en: en as Messages,
};

function load(locale: Locale): Messages {
  return BUNDLES[locale];
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
  const messages = chain
    .map(load)
    .reduce<Messages>((acc, m) => deepMerge(acc, m), {});

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
