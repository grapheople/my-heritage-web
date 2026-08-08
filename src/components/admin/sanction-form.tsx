"use client";

import { useState, useTransition } from "react";
import { issueSanction, type SanctionReason } from "@/lib/actions/admin";

/**
 * 제재 부과 (A-10, myroom-service F-07).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 3단계 · 사유 필수 | D-064, FR-07-A-01·04 |
 * | 일시 정지는 **기간 필수** | FR-07-A-02 |
 * | **경고는 기능을 제한하지 않는다** | FR-07-A-07 |
 * | 정지는 방을 **비공개로 강제 전환** | D-065, FR-07-B-01 |
 * | 신고를 거치지 않은 **직권 제재 허용** | FR-07-A-03 |
 * | **경고 누적으로 자동 승격하지 않는다** | FR-07-A-06 |
 *
 * ## ⚠️ 단계에 따라 결과가 크게 갈린다
 * 경고는 안내만 가고, 정지는 **방이 비공개가 되어 판매중 매물이 마켓에서
 * 내려간다.** 화면에서 그 차이를 미리 보여준다 — 어드민이 "경고 누르듯이"
 * 정지를 누르면 유저의 매출이 멈춘다.
 *
 * 아이템·일기·매물은 **삭제되지 않는다** (FR-07-B-02). 제재는 노출을 멈출 뿐이다.
 */
const LEVELS = [
  { value: "WARNING", label: "경고", effect: "안내만 갑니다. 기능 제한 없음 (FR-07-A-07)" },
  { value: "SUSPENDED", label: "일시 정지", effect: "방이 비공개가 되고 판매중 매물이 마켓에서 내려갑니다. 기간 필수" },
  { value: "BANNED", label: "영구 정지", effect: "방이 비공개가 됩니다. 해제는 수동으로만 (FR-07-A-08)" },
] as const;

const REASONS: { value: SanctionReason; label: string }[] = [
  { value: "FAKE", label: "위조품" },
  { value: "STOLEN", label: "도난품" },
  { value: "WEAPON", label: "무기류" },
  { value: "DRUG", label: "의약품·마약류" },
  { value: "ALCOHOL", label: "주류" },
  { value: "NON_PHYSICAL", label: "실물 없는 상품" },
  { value: "PHISHING", label: "사기·피싱 링크" },
  { value: "INAPPROPRIATE", label: "부적절한 콘텐츠" },
  { value: "WRONG_INFO", label: "정보 오류" },
  { value: "REPEATED", label: "반복 위반" },
  { value: "OTHER", label: "기타" },
];

export type SanctionTarget = {
  userId: string;
  roomName: string;
  email: string;
  roomPublic: boolean;
  withdrawn: boolean;
  activeSanctions: number;
};

export function SanctionForm({
  targets,
  query,
  preselected,
}: {
  targets: SanctionTarget[];
  query: string;
  /** 신고 처리에서 넘어온 경우 미리 골라둔다 (FR-05-A-09) */
  preselected?: SanctionTarget;
}) {
  const [target, setTarget] = useState<SanctionTarget | null>(preselected ?? null);
  const [level, setLevel] = useState<(typeof LEVELS)[number]["value"]>("WARNING");
  const [reasonCode, setReasonCode] = useState<SanctionReason>("FAKE");
  const [detail, setDetail] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, startTransition] = useTransition();

  const levelInfo = LEVELS.find((l) => l.value === level)!;

  if (done) {
    return (
      <div className="rounded-lg border border-sale bg-sale-bg p-4 text-sm">
        <p className="font-semibold text-sale">{done}</p>
        <p className="mt-1 text-muted-foreground">
          대상 유저에게 인앱 알림이 갔습니다 (FR-08-B-03). 제재 중에도 로그인은
          막지 않습니다 — 사유를 알릴 경로가 알림함뿐이기 때문입니다 (D-066).
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4">
      <h2 className="text-sm font-bold">제재 부과</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        신고를 거치지 않은 직권 제재도 가능합니다 (FR-07-A-03).
      </p>

      {/* ① 대상 — 방 이름 또는 이메일로 찾는다 */}
      <form method="get" className="mt-3 flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="방 이름 또는 이메일"
          className="w-72 rounded-md border px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
          찾기
        </button>
      </form>

      {targets.length > 0 && (
        <ul className="mt-2 divide-y rounded-md border">
          {targets.map((t) => (
            <li key={t.userId}>
              <button
                type="button"
                onClick={() => setTarget(t)}
                className={
                  target?.userId === t.userId
                    ? "flex w-full items-center gap-3 bg-accent px-3 py-2 text-left text-sm"
                    : "flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent/50"
                }
              >
                <span className="font-semibold">{t.roomName}</span>
                <span className="font-mono text-xs text-muted-foreground">{t.email}</span>
                {!t.roomPublic && <span className="text-xs text-muted-foreground">비공개 방</span>}
                {t.withdrawn && <span className="text-xs text-warn">탈퇴</span>}
                {t.activeSanctions > 0 && (
                  // ⚠️ 참고용이다. **누적으로 자동 승격하지 않는다** (FR-07-A-06)
                  <span className="text-xs text-warn">진행 중 제재 {t.activeSanctions}건</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {target && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            startTransition(async () => {
              const res = await issueSanction({
                userId: target.userId,
                level,
                reasonCode,
                detail: detail.trim() || undefined,
                expiresAt: level === "SUSPENDED" ? expiresAt : undefined,
              });
              if (res.ok) setDone(`${target.roomName} 에 ${levelInfo.label} 을 부과했습니다.`);
              else setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
            });
          }}
          className="mt-4 flex flex-col gap-3 border-t pt-4"
        >
          <p className="text-sm">
            대상 <b>{target.roomName}</b>{" "}
            <span className="font-mono text-xs text-muted-foreground">{target.email}</span>
          </p>

          {/* ② 단계 — 결과가 크게 갈리므로 효과를 함께 보여준다 */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">단계</span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as typeof level)}
              className="w-56 rounded-md border px-3 py-2 text-sm"
            >
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">{levelInfo.effect}</span>
          </label>

          {/* 일시 정지는 기간 필수 (FR-07-A-02) */}
          {level === "SUSPENDED" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">해제 예정일</span>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-56 rounded-md border px-3 py-2 text-sm"
              />
              <span className="text-xs text-muted-foreground">
                만료되면 자동 해제됩니다 (FR-07-A-09).
              </span>
            </label>
          )}

          {/* ③ 사유 — enum. 유저에게는 자기 언어로 보인다 (D-103) */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">사유</span>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as SanctionReason)}
              className="w-56 rounded-md border px-3 py-2 text-sm"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              유저에게는 자기 언어로 번역되어 보입니다 (D-103).
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">
              상세 {reasonCode === "OTHER" && <span className="text-destructive">*</span>}
            </span>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={2}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            <span className="text-xs text-muted-foreground">
              {/* ⚠️ 상세는 번역되지 않는다 — 어드민이 쓴 언어 그대로 보인다 */}
              어드민이 쓴 원문 그대로 보입니다(번역되지 않음). 기타를 고르면 필수입니다.
            </span>
          </label>

          {level !== "WARNING" && (
            <p className="rounded-md border border-warn bg-warn-bg p-3 text-xs text-warn">
              방이 비공개로 전환되고 판매중 매물이 마켓에서 내려갑니다. 해제 시
              <b> 제재 이전 공개 상태로 복원</b>됩니다 (D-065). 아이템·일기·매물은
              삭제되지 않습니다 (FR-07-B-02).
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {pending ? "부과 중…" : `${levelInfo.label} 부과`}
            </button>
            <button
              type="button"
              onClick={() => setTarget(null)}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              대상 바꾸기
            </button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      )}
    </div>
  );
}
