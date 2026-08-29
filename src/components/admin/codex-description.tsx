"use client";

import { useState, useTransition } from "react";
import { setCodexDescriptions } from "@/lib/actions/admin";

type Descriptions = { ko: string; ja: string; en: string };

const LANGS = ["ko", "ja", "en"] as const;

/**
 * A-04 도감 **설명** — 읽기 + 편집 (D-281·D-282, `FR-07-A-05`).
 *
 * ## ⚠️ 명칭과 갈라 둔다 (D-282)
 * 명칭은 **항상 있어야** 하고 검증과 무관하다. 설명은 **없는 것이 기본**이고
 * (전체 도감 1,113건 중 0건) **검증본만 3개 언어**다. 한 폼에 묶여 있을 때
 * 명칭만 고치려던 저장이 설명을 지웠다 (D-280).
 *
 * ## ⚠️ 읽기가 먼저다 (D-281)
 * 예전에는 검증본 설명을 **편집을 열어야만** 볼 수 있었다. A-05 는 "이 도감이
 * 맞는가" 를 판단하는 일인데, 확인하려고 저장 경로가 달린 폼을 여는 것은
 * 사고를 부른다. 읽기 블록을 항상 두고 **고칠 때만** 편집을 연다.
 *
 * ## ⚠️ 빈 상태도 말한다
 * 없는 것과 못 읽는 것은 다르다. 아무 말이 없으면 운영자는 화면이 고장난
 * 것으로 읽는다 — 실제로 그렇게 읽혔다.
 *
 * ## ⚠️ 미검증본은 편집할 수 없다
 * 그 자리는 **유저가 쓴 원문**이다. 어드민 문장을 넣으면 유저가 쓴 것으로
 * 읽히고, 검수하지 않은 내용을 서비스가 보증하는 모양이 된다. 화면이 막고
 * 서버 액션이 한 번 더 막는다.
 */
export function CodexDescriptionEditor({
  codexId,
  verified,
  descriptions,
  userDescription,
}: {
  codexId: string;
  verified: boolean;
  /** 검증본의 3개 언어 설명. 빈 문자열 = 미설정 */
  descriptions: Descriptions;
  /** 미검증본이 보여줄 유저 원문 */
  userDescription: string;
}) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState(descriptions);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const hasAny = LANGS.some((l) => descriptions[l]?.trim());
  const dirty = LANGS.some((l) => desc[l] !== descriptions[l]);

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold">
          설명
          <span className="ml-2 font-normal text-muted-foreground">
            {verified ? "검증본 — 3개 언어" : "미검증본 — 유저가 쓴 원문"}
          </span>
        </p>
        {/* ⚠️ 미검증본에는 편집 버튼을 주지 않는다 — 그 자리는 유저의 것이다 */}
        {verified && !open && (
          <button
            type="button"
            // 열 때 지금 값으로 되맞춘다 (D-280)
            onClick={() => {
              setDesc(descriptions);
              setDone("");
              setOpen(true);
            }}
            className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
          >
            {hasAny ? "설명 편집" : "설명 입력"}
          </button>
        )}
      </div>

      {/* ── 읽기 ── */}
      {!open &&
        (verified ? (
          hasAny ? (
            <dl className="mt-2 grid gap-2 sm:grid-cols-3">
              {LANGS.map((l) => (
                <div key={l}>
                  <dt className="text-xs uppercase text-muted-foreground">{l}</dt>
                  <dd className="mt-0.5 text-sm whitespace-pre-wrap">
                    {descriptions[l] || (
                      <span className="text-muted-foreground">— 비어 있음</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              아직 설명이 없습니다. 검증본은 <b>3개 언어</b>를 채웁니다
              (FR-07-A-05).
            </p>
          )
        ) : userDescription ? (
          <p className="mt-1 text-sm whitespace-pre-wrap">{userDescription}</p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            유저가 쓴 설명이 없습니다. <b>미검증본에는 어드민 문장을 넣지
            않습니다</b> — 유저가 쓴 것으로 읽힙니다 (FR-07-A-05).
          </p>
        ))}

      {/* ── 편집 (검증본만) ── */}
      {open && (
        <div className="mt-2">
          <div className="grid gap-2 sm:grid-cols-3">
            {LANGS.map((l) => (
              <label key={l} className="block">
                <span className="text-xs uppercase text-muted-foreground">{l}</span>
                <textarea
                  value={desc[l]}
                  onChange={(e) => setDesc({ ...desc, [l]: e.target.value })}
                  rows={4}
                  className="mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
                />
              </label>
            ))}
          </div>
          {/* ⚠️ 빈 칸은 "지워라" 가 아니다 (D-280) — 화면에 밝힌다 */}
          <p className="mt-1.5 text-xs text-muted-foreground">
            빈 칸은 <b>건드리지 않습니다</b> — 저장해도 기존 값이 남습니다. 지우는
            동작은 아직 없습니다.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={pending || !dirty}
              onClick={() =>
                startTransition(async () => {
                  setError("");
                  const res = await setCodexDescriptions(codexId, desc);
                  if (res.ok) {
                    setDone("저장했습니다");
                    setOpen(false);
                  } else {
                    setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
                  }
                })
              }
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              {pending ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDesc(descriptions);
                setOpen(false);
              }}
              className="rounded-md border px-3 py-1.5 text-xs"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {done && <p className="mt-1.5 text-xs text-sale">{done}</p>}
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}
