"use client";

import { useState, useTransition } from "react";
import { setMatchingKey, setSubtypeMatchingKey } from "@/lib/actions/admin";

/**
 * A-03 매칭 키 편집 (D-013 · D-041).
 *
 * ## ⚠️ 바꾸면 이후 등록의 도감 연결 기준이 달라진다
 * 이미 만들어진 도감의 `normalizedKey` 는 그대로라서 **옛 기준 도감과 새 기준
 * 도감이 공존한다.** 그래서 변경 이력을 남긴다 (FR-01-B-04) — 나중에 병합할 때
 * 왜 갈라졌는지 알아야 한다. 화면에서 그 사실을 경고한다.
 *
 * ## 쓸 수 있는 타입이 4종뿐이다 (D-041, FR-01-A-06)
 * `text`·`number`·`select`·`date`. `multiselect`·`boolean`·`textarea`·`url` 은
 * 정규화가 성립하지 않는다 — 값이 배열이거나 참/거짓이면 고유값이 될 수 없다.
 * 서버도 검증하지만 **목록에서 애초에 빼는 것**이 더 낫다.
 */
export function MatchingKeyEditor({
  categoryKey,
  categoryLabel,
  current,
  candidates,
  subtypeId,
}: {
  categoryKey: string;
  categoryLabel: string;
  current: string[];
  /** 매칭 키로 쓸 수 있는 속성만 (D-041) */
  candidates: { key: string; label: string; type: string }[];
  /**
   * D-207 — 주면 **그 제품군 전용** 매칭 키를 편집한다.
   *
   * ⚠️ **에디터를 두 벌로 나누지 않았다.** 타입 제한(D-041)·최소 개수·경고
   * 문구가 같은데 컴포넌트가 둘이면 한쪽만 고쳐진다 — D-190·D-197·D-202 가
   * 전부 "같은 규칙을 두 곳에 뒀다"는 실패였다.
   */
  subtypeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<string[]>(current);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border px-2 py-1 text-xs whitespace-nowrap hover:bg-accent"
      >
        {saved ? "저장됨" : "편집"}
      </button>
    );
  }

  return (
    <div className="w-[560px] rounded-md border p-3 text-left">
      <p className="text-xs font-semibold">{categoryLabel}</p>

      <p className="mt-2 rounded-md border border-warn bg-warn-bg p-2 text-xs text-warn">
        ⚠️ 바꾸면 <b>이후 등록</b>의 연결 기준만 달라집니다. 이미 만들어진 도감은
        옛 기준으로 남아 <b>두 기준이 공존</b>합니다. 변경 이력이 기록됩니다
        (FR-01-B-04).
      </p>

      <ul className="mt-2 flex flex-wrap gap-2">
        {candidates.map((c) => {
          const on = keys.includes(c.key);
          const order = keys.indexOf(c.key) + 1;
          return (
            <li key={c.key}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setKeys(on ? keys.filter((k) => k !== c.key) : [...keys, c.key])
                }
                className={
                  on
                    ? "rounded-full border border-foreground bg-foreground px-3 py-1.5 text-xs font-semibold text-background"
                    : "rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                }
              >
                {/* 복합 키는 순서가 정규화 키 생성 순서다 (FR-01-A-05) */}
                {on && <span className="mr-1 font-mono">{order}</span>}
                {c.label}
                <span className="ml-1 font-mono opacity-60">{c.type}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-xs text-muted-foreground">
        고른 순서가 정규화 키 생성 순서입니다 (FR-01-A-05). 최소 1개 필요합니다.
      </p>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={pending || keys.length === 0}
          onClick={() =>
            startTransition(async () => {
              /*
                ⚠️ **제품군은 빈 배열이 허용된다** — "전용을 없앤다"는 뜻이고
                그러면 카테고리 기본으로 떨어진다 (D-207 결정 4). 카테고리
                기본은 최소 1개가 필요하다 (FR-01-A-03)
              */
              const res = subtypeId
                ? await setSubtypeMatchingKey({ subtypeId, attributeKeys: keys })
                : await setMatchingKey({ categoryKey, attributeKeys: keys });
              if (res.ok) {
                setSaved(true);
                setOpen(false);
              } else {
                setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
              }
            })
          }
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          저장
        </button>
        <button
          type="button"
          onClick={() => {
            setKeys(current);
            setOpen(false);
          }}
          className="rounded-md border px-3 py-1.5 text-xs"
        >
          취소
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}
