/**
 * 정책 상수 — **결정으로 확정된 값만** 둔다.
 *
 * ⚠️ 어드민이 운영하는 값(레벨 테이블·카테고리별 속성 조합·브랜드 마스터)은
 * 여기 두지 않는다. 상수로 박으면 어드민 화면이 무의미해진다 (A-02·A-09).
 * 여기 있는 것은 **어드민이 바꿀 수 없는 제품 규칙**이다.
 */

/** 일기 본문 최대 길이. 언어 무관 유니코드 문자 수 (D-053, FR-01-A-01·02) */
export const DIARY_MAX_LENGTH = 1000;
/** 사진 최대 장수 — 아이템·일기 공통 (D-037) */
export const MAX_PHOTOS = 10;

/**
 * 신고 사유 (FR-05-A-02, D-035·D-052).
 * **금지품목 6종 + 사기·피싱 링크 + 부적절한 콘텐츠 + 정보 오류.**
 * 자동 판정하지 않는다 (FR-06-A-04) — 신고 기반 사후 조치다.
 */
export const REPORT_REASONS = [
  // 금지품목 6종 (D-052)
  "fake", "stolen", "weapon", "drug", "alcohol", "nonphysical",
  // 그 외
  "phishing", "inappropriate", "wrongInfo",
] as const;

export type ReportTarget =
  | "item"
  | "diary"
  | "room"
  | "codex"
  | "link"
  // 하루기록 댓글 (D-179, OI-89 해소)
  | "comment";

/** 신고 가능 대상 (FR-05-A-01, D-029·D-035·D-040) */
export const REPORT_TARGETS: ReportTarget[] = [
  "item", "diary", "room", "codex", "link", "comment",
];
