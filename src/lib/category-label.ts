/**
 * 카테고리 이름 (한국어) — **어드민 화면·프롬프트 공용** (D-030).
 *
 * ## ⚠️ 하드코딩된 라벨 맵을 없애기 위해 만들었다
 * 어드민 곳곳에 `{ watch: "시계", shoes: "신발", ... }` 같은 맵이 흩어져
 * 있었고, **카테고리를 추가할 때마다 한 곳씩 빠졌다** — 운동(D-163)을 넣었을
 * 때 도감 화면 두 곳이 `workout` 을 그대로 렌더했다. A-11 이 모든 브랜드의
 * 연결 카테고리를 "시계"로 표시하던 것과 같은 종류의 버그다.
 *
 * `messages/ko.json` 이 이미 7개 카테고리 이름의 단일 출처다. 그것을 읽는다 —
 * 카테고리가 늘어도 고칠 곳이 없다.
 *
 * ## ⚠️ 서버에서만 부른다
 * 어드민은 `[locale]` 밖이라 `NextIntlClientProvider` 가 없다 (D-030). 즉
 * `useTranslations` 를 쓸 수 없어서 이 경로가 필요하다.
 */
type KoMessages = { category?: Record<string, string> };

/** `watch` · `category.watch` 둘 다 받는다 — 호출부가 두 형태를 쓴다 */
export async function categoryLabelKo(key: string): Promise<string> {
  const messages = (await import("../../messages/ko.json")).default as KoMessages;
  const bare = key.startsWith("category.") ? key.slice("category.".length) : key;
  // 없으면 키를 그대로 쓴다 — 빈 칸보다 낫다
  return messages.category?.[bare] ?? bare;
}
