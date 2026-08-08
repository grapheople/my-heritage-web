/**
 * 사진 URL 해석 — **스토리지가 아직 없다** (OI-47).
 *
 * 등록 Server Action 은 사진 순서만 만들고 `placeholder://item/0` 같은 값을
 * 넣는다. 그대로 `next/image` 에 넘기면 **호스트가 없어서 렌더가 터진다.**
 *
 * ⚠️ 이것을 `next.config` 의 `images.remotePatterns` 로 뚫어서는 안 된다 —
 * 존재하지 않는 호스트를 허용 목록에 넣는 것이라 스토리지가 붙어도 남는다.
 * **없는 사진은 없는 것으로 다룬다.** 화면(`ItemThumb`)이 id 기반 결정적
 * 그라디언트로 대체한다.
 */
const PLACEHOLDER = "placeholder://";

export function realPhotoUrl(url: string | undefined): string | undefined {
  if (!url || url.startsWith(PLACEHOLDER)) return undefined;
  return url;
}
