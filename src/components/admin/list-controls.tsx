"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
// ⚠️ 서버 컴포넌트도 쓰는 규칙이라 클라이언트 모듈 밖에 둔다 (D-203)
import { PAGE_SIZES, parseListParams } from "@/lib/admin-list-params";

/**
 * 어드민 목록 공용 컨트롤 — 검색 · 카테고리 필터 · 페이지 크기 · 페이징.
 *
 * ## ⚠️ 상태를 URL 에 둔다 (컴포넌트 state 가 아니라)
 * 어드민 목록은 **주소를 주고받는다** — "이 브랜드 좀 봐주세요"가 링크로
 * 오간다. state 로 두면 새로고침·뒤로가기에서 조건이 날아가고 공유도 안 된다.
 * 유저 도감 검색이 `?q=`·`?category=` 를 쓰므로(D-160) **이름을 맞춘다** —
 * 같은 개념을 두 이름으로 부르지 않는다.
 *
 * ## ⚠️ 조건이 바뀌면 페이지를 1로 되돌린다
 * 3페이지에서 검색어를 넣으면 결과가 1페이지뿐이라 **빈 화면**이 된다.
 * 어드민은 그것을 "검색 결과 없음"으로 읽는다.
 */

export function AdminListControls({
  categories,
  total,
  filtered,
  loadLimit,
}: {
  /** `{ key, label }` — 라벨은 서버에서 온다 (어드민은 ko 단일, D-030) */
  categories: { key: string; label: string }[];
  /** 필터 적용 **전** 전체 건수 */
  total: number;
  /** 필터 적용 **후** 건수 */
  filtered: number;
  /** 조회 상한. 넘으면 알린다 — 절단을 숨기지 않는다 (D-160) */
  loadLimit: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(sp.get("q") ?? "");

  const current = parseListParams(Object.fromEntries(sp.entries()));

  function apply(next: Partial<{ q: string; category: string; size: string; page: string }>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    // 조건이 바뀌면 1페이지로 (page 를 직접 넘긴 경우는 제외)
    if (!("page" in next)) params.delete("page");
    const qs = params.toString();
    /*
      ⚠️ `typedRoutes` 는 동적으로 만든 쿼리 문자열을 검증할 수 없다 (D-094 —
      Next 16 설정). 경로는 `usePathname()` 이 준 현재 주소 그대로이고 바뀌는
      것은 쿼리뿐이므로 캐스팅한다 — 새 라우트를 만드는 것이 아니다.
    */
    startTransition(() =>
      router.replace((qs ? `${pathname}?${qs}` : pathname) as Route),
    );
  }

  const lastPage = Math.max(1, Math.ceil(filtered / current.size));
  const page = Math.min(current.page, lastPage);
  const from = filtered === 0 ? 0 : (page - 1) * current.size + 1;
  const to = Math.min(page * current.size, filtered);

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q: draft.trim() });
          }}
          className="flex gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="이름 · 고유값 · alias 검색"
            className="w-64 rounded-md border px-2 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            검색
          </button>
          {current.q && (
            <button
              type="button"
              onClick={() => {
                setDraft("");
                apply({ q: "" });
              }}
              className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground"
            >
              초기화
            </button>
          )}
        </form>

        <select
          value={current.category}
          onChange={(e) => apply({ category: e.target.value })}
          className="rounded-md border px-2 py-1.5 text-sm"
        >
          <option value="">전체 카테고리</option>
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          value={String(current.size)}
          onChange={(e) => apply({ size: e.target.value })}
          className="rounded-md border px-2 py-1.5 text-sm"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}개씩
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>
          {filtered === 0 ? (
            "결과 없음"
          ) : (
            <>
              {from}–{to} / <b>{filtered}</b>건
              {filtered !== total && <> (전체 {total}건)</>}
            </>
          )}
          {pending && <span className="ml-2">불러오는 중…</span>}
        </p>

        {/*
          ⚠️ **절단을 숨기지 않는다** (D-160). 상한에 걸리면 화면의 "전체"가
          진짜 전체가 아니다 — 말하지 않으면 어드민이 "그 브랜드는 없다"로 읽는다
        */}
        {total >= loadLimit && (
          <p className="text-warn">
            조회 상한 {loadLimit}건에 걸렸습니다 — 이 뒤의 데이터는 검색으로도 나오지 않습니다
          </p>
        )}

        {lastPage > 1 && (
          <span className="flex items-center gap-1">
            <PageBtn label="처음" disabled={page === 1} onClick={() => apply({ page: "" })} />
            <PageBtn label="이전" disabled={page === 1} onClick={() => apply({ page: String(page - 1) })} />
            <span className="px-2">
              {page} / {lastPage}
            </span>
            <PageBtn label="다음" disabled={page === lastPage} onClick={() => apply({ page: String(page + 1) })} />
            <PageBtn label="마지막" disabled={page === lastPage} onClick={() => apply({ page: String(lastPage) })} />
          </span>
        )}
      </div>
    </div>
  );
}

function PageBtn({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border px-2 py-1 disabled:opacity-30"
    >
      {label}
    </button>
  );
}
