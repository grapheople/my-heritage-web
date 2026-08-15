"use client";

import { useState, useTransition } from "react";
import { approveKeyAliasCandidate, rejectKeyAliasCandidate } from "@/lib/actions/admin";

export type KeyAliasCandidate = {
  categoryId: string;
  attempted: string;
  count: number;
  lastSeenAt: Date | null;
  target: { id: string; displayName: string; normalizedKey: string };
};

/**
 * A-07 키 alias **후보 큐** (FR-06-C-09·10, D-198).
 *
 * ## ⚠️ 이 목록의 재료는 AI 가 아니라 유저다
 * **등록 매칭은 미스였는데 같은 값으로 검색하면 도감이 나온** 경우다. 검색은
 * 부분일치이므로(FR-06-B-01) 이 조합은 "도감은 있는데 키가 안 맞았다" =
 * **단위 차이**를 뜻한다 (OI-97 유형 — `1460` vs `11822006`).
 *
 * 승인하면 다음 유저부터 그 값이 대상 도감으로 연결된다. **승인 전에는
 * 아무 효과가 없다** — 키 alias 가 틀리면 아이템이 엉뚱한 도감에 붙기 때문에
 * 명칭 alias 와 달리 게이트를 둔다 (D-194).
 *
 * ⚠️ **기각해도 로그는 지우지 않는다** — 로그는 H11 판별(미스 원인이 단위
 * 차이냐 도감 부재냐)의 재료이기도 하다. 후보 조건에서만 뺀다.
 */
export function KeyAliasCandidates({ candidates }: { candidates: KeyAliasCandidate[] }) {
  const [done, setDone] = useState<Record<string, "approved" | "rejected">>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (candidates.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        후보가 없습니다. 등록 미스가 쌓이면 여기에 나타납니다 — 아직 데이터가 없거나,
        미스 원인이 <b>단위 차이가 아니라 도감 부재</b>라는 뜻입니다 (H11).
      </p>
    );
  }

  return (
    <>
      {error && <p className="mb-2 text-xs text-warn">{error}</p>}
      <table className="w-full text-left text-xs">
        <thead className="border-b text-muted-foreground">
          <tr>
            <th className="py-2">유저가 넣은 값</th>
            <th>검색이 지목한 도감</th>
            <th>정식 값</th>
            <th>횟수</th>
            <th>조치</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => {
            const key = `${c.categoryId}${c.attempted}`;
            const state = done[key];
            return (
              <tr key={key} className="border-b last:border-0">
                <td className="py-2">
                  <code className="rounded bg-muted px-1">{c.attempted}</code>
                </td>
                <td>{c.target.displayName}</td>
                <td className="text-muted-foreground">
                  <code>{c.target.normalizedKey}</code>
                </td>
                <td className={c.count >= 3 ? "font-bold" : ""}>{c.count}</td>
                <td>
                  {state === "approved" ? (
                    <span className="text-sale">승인됨</span>
                  ) : state === "rejected" ? (
                    <span className="text-muted-foreground">기각됨</span>
                  ) : (
                    <span className="flex gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const res = await approveKeyAliasCandidate({
                              codexId: c.target.id,
                              value: c.attempted,
                            });
                            if (res.ok) setDone((d) => ({ ...d, [key]: "approved" }));
                            else setError(res.formError ?? "승인하지 못했습니다");
                          })
                        }
                        className="rounded-md border px-2 py-1 hover:bg-accent"
                      >
                        키 alias 로 승인
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const res = await rejectKeyAliasCandidate({
                              categoryId: c.categoryId,
                              attempted: c.attempted,
                            });
                            if (res.ok) setDone((d) => ({ ...d, [key]: "rejected" }));
                          })
                        }
                        className="rounded-md border px-2 py-1 text-muted-foreground hover:bg-accent"
                      >
                        기각
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
