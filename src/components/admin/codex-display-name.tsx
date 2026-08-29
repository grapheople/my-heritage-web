"use client";

import { useState, useTransition } from "react";
import { setCodexDisplayNames } from "@/lib/actions/admin";
import {
  DisplayNameFields,
  type DisplayNames,
} from "./display-name-fields";

/**
 * 도감 **표시명** 편집 (A-04 상세, D-276).
 *
 * ## ⚠️ 전부 비워 두는 것이 기본이다
 * 도감 1,113건 중 **1,002건이 비어 있고 그게 맞다.** 라틴 원문
 * (`Rolex Submariner 126610LN`)은 어느 언어권 컬렉터든 그렇게 부르므로
 * 채울 이유가 없다 (D-009).
 *
 * **실제로 필요한 곳은 다른 언어권이 읽을 수 없는 것뿐**이다 — 캠핑의 일본어
 * 33건(`DOD カマボコテント3`)처럼. 그래서 화면이 **원문 표기를 먼저 판정해**
 * 채울 필요가 있는지 알려준다. 안 그러면 운영자가 1,113건을 다 채우려 든다.
 *
 * ⚠️ **원문은 여기서 못 고친다** — 위 "명칭 · 설명" 이 담당한다.
 */
const NON_LATIN = /[぀-ヿ㐀-䶿一-鿿가-힯]/;

export function CodexDisplayNameEditor({
  codexId,
  displayName,
  initial,
}: {
  codexId: string;
  /** 원문 — 표시명이 없을 때 떨어질 자리 */
  displayName: string;
  initial: DisplayNames;
}) {
  const [names, setNames] = useState(initial);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  /*
    ⚠️ 원문이 라틴이면 **채우지 말라고 말한다.** 채워도 막지는 않는다 —
    `G-SHOCK` 처럼 한국어 통용 표기가 유용한 경우가 있다. 다만 기본값은
    "안 채우는 것" 이어야 1,002건을 헛되이 채우는 일이 안 생긴다
  */
  const needsHelp = NON_LATIN.test(displayName);
  const dirty =
    names.ko !== initial.ko || names.ja !== initial.ja || names.en !== initial.en;

  return (
    <div className="rounded-lg border p-4">
      {needsHelp ? (
        <p className="mb-3 rounded-md border border-warn bg-warn-bg p-2 text-xs text-warn">
          ⚠️ 원문이 <b>라틴 표기가 아닙니다</b>. 다른 언어권 유저는 이 이름을 읽을
          수 없으므로 <b>영어 표시명을 채우는 것이 좋습니다</b>.
        </p>
      ) : (
        <p className="mb-3 text-xs text-muted-foreground">
          원문이 라틴 표기라 <b>비워두는 것이 기본</b>입니다 — 컬렉터는 원문으로
          부릅니다 (D-009). 통용 표기가 따로 있을 때만 채우세요.
        </p>
      )}

      <DisplayNameFields
        value={names}
        onChange={setNames}
        original={displayName}
        samples={{ en: displayName, ko: "카마보코 텐트 3", ja: "カマボコテント3" }}
      />

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() =>
            startTransition(async () => {
              setError("");
              setDone("");
              const res = await setCodexDisplayNames(codexId, names);
              if (res.ok) setDone("저장했습니다");
              else setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
            })
          }
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => setNames(initial)}
            className="rounded-md border px-3 py-1.5 text-xs"
          >
            되돌리기
          </button>
        )}
        {done && <span className="text-xs text-sale">{done}</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}
