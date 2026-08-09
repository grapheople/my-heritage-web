import { defineRouting } from "next-intl/routing";

/**
 * ko / ja / en — 3개 모두 1급 언어. "기본 언어"는 두지 않는다 (D-003).
 * `defaultLocale`은 next-intl이 요구하는 기술적 fallback일 뿐이며,
 * 미지원 locale 진입 시 `en`으로 처리하라는 D-012 규칙과 일치시킨 값이다.
 *
 * SoT: policies/i18n/policy-handoff.md
 */
export const locales = ["ko", "ja", "en"] as const;

/**
 * 로케일 쿠키 이름.
 *
 * 상수로 뺀 이유: 가입 시점 언어를 정할 때 인증 쪽에서도 이 쿠키를 읽는다
 * (D-120). 문자열을 양쪽에 적어두면 한쪽만 바뀌었을 때 **조용히 기본값으로
 * 떨어진다** — 전원 `en` 으로 기록되는데 오류는 안 난다.
 */
export const LOCALE_COOKIE = "MYHERITAGE_LOCALE";
export type Locale = (typeof locales)[number];

/** 미번역 key 대신 채워 넣을 fallback 언어 순서 — 요청 언어 → en → ko (D-012) */
export const fallbackChain: readonly Locale[] = ["ko", "en"];

export const routing = defineRouting({
  locales,
  defaultLocale: "en",
  // 3개 언어 전부 URL에 노출한다. 공유 링크가 언어를 보존해야 한다.
  localePrefix: "always",
  // 최초 진입 시 Accept-Language 자동 판별 (FR-06-A-01)
  localeDetection: true,
  // 비로그인 유저의 언어 선택 보존 (FR-05-B-03)
  localeCookie: {
    name: LOCALE_COOKIE,
    maxAge: 60 * 60 * 24 * 365,
  },
});
