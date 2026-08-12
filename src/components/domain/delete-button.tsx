"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions/shared";

/**
 * 되돌릴 수 없는 삭제 버튼 — 일기·착용샷 공용 (D-180).
 *
 * ## ⚠️ 확인을 받는다
 * 삭제는 **되돌릴 수 없다.** 일기는 사진·아이템 연결이 Cascade 로 함께 지워지고
 * (아이템 자체는 남는다, M-03), 착용샷은 그날의 기록이 사라진다.
 *
 * ## ⚠️ 삭제 후 어디로 갈지는 호출부가 정한다
 * 지운 화면에 그대로 남으면 404 를 보게 된다. `redirectTo` 로 목록으로 보낸다.
 *
 * 액션을 프롭으로 받는다 — 일기·착용샷 두 곳에서 쓰므로 컴포넌트를 두 개 만들
 * 이유가 없다. 서버 액션은 클라이언트 컴포넌트에 프롭으로 넘길 수 있다.
 */
export function DeleteButton({
  action,
  confirmText,
  label,
  redirectTo,
}: {
  action: () => Promise<ActionResult>;
  confirmText: string;
  label: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(confirmText)) return;
          setError("");
          startTransition(async () => {
            const res = await action();
            if (!res.ok) {
              setError(res.formError ?? label);
              return;
            }
            // ⚠️ `replace` 다 — 뒤로가기로 지워진 화면에 돌아오면 404 다
            router.replace(redirectTo);
          });
        }}
        className="text-sm text-destructive underline disabled:opacity-40"
      >
        {label}
      </button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
