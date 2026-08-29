"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState, useTransition } from "react";
import {
  researchCodexAgain,
  setCodexDisplayNames,
  updateCodexItem,
} from "@/lib/actions/admin";

type Names = { ko?: string; ja?: string; en?: string };
type Candidate = {
  displayName: string;
  keyValues: Record<string, string>;
  names: Names;
};

const LANG_LABEL: Record<string, string> = { en: "영어", ko: "한국어", ja: "일본어" };

/**
 * 도감 한 건을 **다시 조사한다 — 제안만 보여준다** (D-268).
 *
 * ## ⚠️ 조사 결과를 자동으로 반영하지 않는다
 * 값을 나란히 놓고 **사람이 [적용] 을 누른다.** 바로 반영하면 D-185 가 막아둔
 * 것 — AI 가 지어낸 값이 조용히 자리를 차지하는 것 — 이 그대로 일어난다.
 *
 * ## ⚠️ 검증 상태를 건드리지 않는다
 * "수집 후 자동 검증완료" 는 만들지 않는다. 검증은 이 화면의 별도 버튼으로
 * **사람이** 누른다 (D-269).
 *
 * ## ⚠️ 적용할 수 있는 것은 **명칭과 표시명뿐**이다
 * | 값 | 적용 | 왜 |
 * |---|---|---|
 * | `displayName`(원문) | ✅ | 이름일 뿐 매칭에 안 쓰인다 |
 * | 표시명 `ko`/`ja`/`en` | ✅ (D-278) | 화면 표기일 뿐이다 |
 * | **식별 값** | ❌ | 바뀌면 **다른 제품**이 된다 |
 *
 * 식별 값(`normalizedKey`)이 바뀌면 유일성 범위와 매칭 키, **이미 연결된 유저
 * 아이템의 매칭 의미**가 함께 움직인다. 시계는 매칭 키가 `uniqueId` 하나라
 * 레퍼런스를 고치는 순간 그 도감은 다른 물건이 된다. 값이 틀렸으면
 * **병합(A-06)이 올바른 도구**다 (D-267).
 */
export function CodexResearchAgain({
  codexId,
  categoryKey,
  currentName,
  currentKeys,
  enabled,
  disabledReason,
}: {
  codexId: string;
  /** 새 도감을 만들 화면으로 보내기 위해 필요하다 (식별 값이 틀렸을 때) */
  categoryKey: string;
  currentName: string;
  /** 현재 식별 값 — 제안과 나란히 놓고 비교한다 */
  currentKeys: { key: string; label: string; value: string }[];
  enabled: boolean;
  disabledReason: string;
}) {
  const [result, setResult] = useState<
    { candidates: Candidate[]; dropped: string[] } | null
  >(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      setError("");
      setDone("");
      setResult(null);
      const res = await researchCodexAgain({ codexId });
      if (res.ok) setResult({ candidates: res.candidates, dropped: res.dropped });
      else setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
    });

  const applyNames = (names: Names) =>
    startTransition(async () => {
      setError("");
      const res = await setCodexDisplayNames(codexId, names);
      if (res.ok) {
        const shown = (["en", "ko", "ja"] as const)
          .filter((l) => names[l])
          .map((l) => `${LANG_LABEL[l]} "${names[l]}"`)
          .join(" · ");
        setDone(`표시명을 적용했습니다 — ${shown}`);
        setResult(null);
      } else setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
    });

  const applyName = (name: string) =>
    startTransition(async () => {
      setError("");
      const res = await updateCodexItem({ codexId, displayName: name });
      if (res.ok) {
        setDone(`명칭을 "${name}" 으로 바꿨습니다`);
        setResult(null);
      } else setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={!enabled || pending}
          className="rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-40"
        >
          {pending ? "조사 중… (1~4분)" : "재수집"}
        </button>
        {/* ⚠️ 숨기지 않고 이유를 붙인다 — 숨기면 이 기능이 있는지조차 모른다 (D-185) */}
        {!enabled && <span className="text-xs text-muted-foreground">{disabledReason}</span>}
      </div>

      <p className="text-xs text-muted-foreground">
        조사 결과는 <b>제안일 뿐</b>입니다 — 눌러도 저장되지 않고, 검증 상태도 바뀌지
        않습니다. 값을 확인한 뒤 직접 적용하세요 (D-185).
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {done && <p className="text-sm text-sale">{done}</p>}

      {result && (
        <div className="rounded-lg border border-dashed p-4">
          {result.candidates.length === 0 ? (
            <p className="text-sm">
              <b>후보 0건.</b> 모델이 확실한 값을 찾지 못했습니다 —{" "}
              <b>0건이 정답일 수 있습니다</b>. 지어낸 값을 받는 것보다 낫습니다.
            </p>
          ) : (
            result.candidates.map((c, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">제안 명칭</span>
                  <span className="font-semibold">{c.displayName}</span>
                  {c.displayName === currentName ? (
                    <span className="text-xs text-muted-foreground">— 현재값과 동일</span>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => applyName(c.displayName)}
                      className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                    >
                      명칭 적용
                    </button>
                  )}
                </div>

                {/* ── 표시명 제안 (D-278) ── */}
                {(["en", "ko", "ja"] as const).some((l) => c.names[l]) ? (
                  <div className="mt-1 rounded-md border border-dashed p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold">표시명 제안</span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => applyNames(c.names)}
                        className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                      >
                        표시명 적용
                      </button>
                    </div>
                    <table className="mt-1 text-xs">
                      <tbody>
                        {(["en", "ko", "ja"] as const)
                          .filter((l) => c.names[l])
                          .map((l) => (
                            <tr key={l}>
                              <td className="py-0.5 pr-3 text-muted-foreground">
                                {LANG_LABEL[l]}
                              </td>
                              <td className="py-0.5">{c.names[l]}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {/* ⚠️ 적용하면 **덮어쓴다.** 기존 값이 있으면 사라진다 */}
                    <p className="mt-1 text-xs text-muted-foreground">
                      적용하면 기존 표시명을 <b>덮어씁니다.</b> 빈 언어는 비워집니다.
                    </p>
                  </div>
                ) : (
                  /*
                    ⚠️ **비어 온 것을 결함으로 읽지 않게 한다.** 라틴 원문은
                    채울 이유가 없고(D-009·D-277) 모델이 확신 없으면 비우는 것이
                    지시사항이다 — 안 그러면 운영자가 다시 눌러 본다
                  */
                  <p className="mt-1 text-xs text-muted-foreground">
                    표시명 제안 없음 — 원문 그대로 쓰면 되는 경우이거나 모델이
                    확신하지 못한 경우입니다. <b>비어 있는 것이 정상</b>입니다.
                  </p>
                )}

                {/*
                  ⚠️ 식별 값은 **비교만** 한다. 다르면 그 자체가 판단 재료다 —
                  값을 고치는 것이 아니라 **이 도감이 맞는지**를 의심할 신호다
                */}
                <table className="mt-1 text-xs">
                  <tbody>
                    {currentKeys.map((k) => {
                      const proposed = c.keyValues[k.key] ?? "";
                      const same = proposed === k.value;
                      return (
                        <tr key={k.key}>
                          <td className="py-0.5 pr-3 text-muted-foreground">{k.label}</td>
                          <td className="py-0.5 pr-3 font-mono">{k.value || "—"}</td>
                          <td className="py-0.5 pr-3 text-muted-foreground">→</td>
                          <td className={`py-0.5 font-mono ${same ? "" : "text-warn"}`}>
                            {proposed || "—"}
                            {!same && <span className="ml-2 not-italic">다름</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {currentKeys.some((k) => (c.keyValues[k.key] ?? "") !== k.value) && (
                  /*
                    ⚠️ **막다른 길을 만들지 않는다** (D-278). 예전에는 "병합하세요"
                    로 끝났는데, **병합할 상대가 없으면 운영자가 멈춘다** — 올바른
                    도감이 아직 없는 것이 흔한 경우다. 2단계를 명시한다
                  */
                  <div className="rounded-md border border-warn bg-warn-bg p-2 text-xs text-warn">
                    <p>
                      ⚠️ 식별 값이 다릅니다. <b>여기서 고칠 수 없습니다</b> — 바꾸면
                      이미 이 도감에 연결된 아이템이 <b>다른 제품에 붙은 채로</b> 남습니다.
                    </p>
                    <p className="mt-1">
                      값이 틀렸다면 이 도감이 잘못 만들어졌다는 뜻입니다.{" "}
                      <b>① 올바른 값으로 도감을 새로 만들고</b>{" "}
                      <Link
                        /* ⚠️ `typedRoutes` 는 리터럴만 받는다 — 런타임 조립
                           경로라 캐스팅을 이 한 줄에 가둔다 (`admin-nav.tsx` 와 같은 패턴) */
                        href={`/admin/categories/${categoryKey}/codex` as Route}
                        className="underline"
                      >
                        (카테고리 상세 → 도감 탭)
                      </Link>{" "}
                      <b>② 이 도감을 그쪽으로 병합</b>하세요{" "}
                      <Link href="/admin/codex/merge" className="underline">
                        (A-06)
                      </Link>
                      . 병합하면 연결된 아이템도 함께 옮겨갑니다 (D-181).
                    </p>
                  </div>
                )}
              </div>
            ))
          )}

          {result.dropped.length > 0 && (
            <div className="mt-3 border-t pt-2">
              <p className="text-xs font-semibold">제외 {result.dropped.length}건</p>
              {/* ⚠️ 제외 사유를 버리지 않는다 — 버리면 원인을 못 짚는다 (D-188) */}
              {result.dropped.map((d, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  · {d}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
