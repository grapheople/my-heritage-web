"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

/**
 * 어드민 조치 버튼.
 *
 * Server Action 을 **prop 으로 받는다** — 서버 컴포넌트에서 인자를 바인딩해
 * 넘기면 클라이언트가 호출할 수 있다. 어드민 화면마다 클라이언트 컴포넌트를
 * 따로 만들지 않기 위한 것이다.
 *
 * ⚠️ **되돌리기 어려운 조치는 `confirm` 문구를 준다.** 제재·병합·비공개 처리는
 * 유저 콘텐츠에 직접 영향을 주는데, 어드민 화면은 클릭 한 번으로 실행된다.
 *
 * 어드민은 ko 단일이라 문구를 그대로 쓴다 (D-030).
 */
export function AdminActionButton({
  action,
  label,
  confirm,
  tone = "default",
  disabled,
}: {
  action: () => Promise<{ ok: boolean; formError?: string }>;
  label: string;
  /** 있으면 확인 단계를 한 번 거친다 */
  confirm?: string;
  tone?: "default" | "primary" | "danger";
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        setDone(true);
        setAsking(false);
      } else {
        setError(res.formError ?? "처리하지 못했습니다");
        setAsking(false);
      }
    });
  }

  if (done) {
    return <span className="text-xs text-muted-foreground">처리됨</span>;
  }

  if (asking) {
    return (
      <span className="flex flex-col gap-1">
        <span className="text-xs text-warn">{confirm}</span>
        <span className="flex gap-1">
          <button
            type="button"
            disabled={pending}
            onClick={run}
            className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            확인
          </button>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="rounded-md border px-2 py-1 text-xs"
          >
            취소
          </button>
        </span>
      </span>
    );
  }

  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending || disabled}
        onClick={() => (confirm ? setAsking(true) : run())}
        className={cn(
          "rounded-md border px-2 py-1 text-xs whitespace-nowrap disabled:opacity-40",
          tone === "primary" && "border-transparent bg-primary font-semibold text-primary-foreground",
          tone === "danger" && "border-destructive text-destructive",
          tone === "default" && "hover:bg-accent",
        )}
      >
        {label}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
