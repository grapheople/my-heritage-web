"use client";

import { useState, useTransition } from "react";
import { inviteAdmin } from "@/lib/actions/admin";

/**
 * 어드민 초대 (A-14, D-104).
 *
 * **비밀번호를 받지 않는다.** 로그인은 기존 소셜(D-021)이라 이메일만 등록하면
 * 그 계정으로 들어온다 — 어드민 비밀번호 관리가 통째로 없다.
 *
 * ⚠️ 이메일은 **소문자로 정규화해 저장**한다 (액션에서). 세션 이메일과
 * 대소문자가 달라 못 들어오는 일이 생기면 원인을 찾기 어렵다.
 */
export function AdminInviteForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        setDone("");
        startTransition(async () => {
          const res = await inviteAdmin({ email, name });
          if (res.ok) {
            setDone(`${name} 님을 어드민으로 등록했습니다.`);
            setEmail("");
            setName("");
          } else {
            setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
          }
        });
      }}
      className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">소셜 로그인 이메일</span>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="name@kakaohealthcare.com"
          className="w-72 rounded-md border px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">이름</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-40 rounded-md border px-3 py-2 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending || !email.trim() || !name.trim()}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        {pending ? "등록 중…" : "어드민 추가"}
      </button>

      {error && <p className="w-full text-sm text-destructive">{error}</p>}
      {done && <p className="w-full text-sm text-sale">{done}</p>}

      <p className="w-full text-xs text-muted-foreground">
        비밀번호를 만들지 않습니다. 이 이메일로 소셜 로그인하면 어드민 화면에
        들어옵니다 (D-021·D-102).
      </p>
    </form>
  );
}
