/**
 * 일기 본문 렌더러 (FR-01-B-01~05, D-055).
 *
 * ⚠️ **플레인 텍스트다.**
 * - 마크다운·HTML을 해석하지 않는다 (FR-01-B-03) → `dangerouslySetInnerHTML` 금지
 * - **URL을 자동으로 링크화하지 않는다** (FR-01-B-02) — 자동 링크화하면
 *   외부 링크 경고(D-040)를 우회하는 경로가 생긴다
 * - 개행은 보존한다 (FR-01-B-04) → `whitespace-pre-wrap`
 * - 번역하지 않는다 (FR-01-B-05) — 유저가 쓴 것이다
 */
export function DiaryBody({ text }: { text: string }) {
  return (
    <p className="text-base leading-relaxed whitespace-pre-wrap break-words">
      {text}
    </p>
  );
}
