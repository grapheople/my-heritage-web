"use client";

import { useState, useTransition } from "react";
import {
  botPostDiary,
  botPostItem,
  createBot,
  verifyBot,
} from "@/lib/actions/bot";
import { BrandSelect } from "@/components/domain/brand-select";

/**
 * A-15 봇 콘솔 (D-146).
 *
 * | 단계 | 동작 |
 * |---|---|
 * | 1 | 봇 생성 — 아이디·비밀번호·방 이름 |
 * | 2 | 봇 로그인 — 아이디·비밀번호 검증 |
 * | 3 | 아이템 / 기록 올리기 |
 *
 * ## ⚠️ 로그인이 세션을 만들지 않는다
 * 검증만 하고 **선택된 봇 id 를 화면이 들고 있는다.** 유저 세션을 발급하면
 * 그것이 곧 이메일/비밀번호 로그인 경로가 되어 `FR-05-A-02`(D-021)를 뚫는다.
 * 새로고침하면 다시 로그인해야 하는 것이 **의도**다.
 */
type Bot = {
  botId: string;
  loginId: string;
  roomName: string;
  language: string;
  items: number;
  diaries: number;
  lastActedAt?: string;
};

export function BotConsole({
  bots,
  categories,
}: {
  bots: Bot[];
  categories: { key: string; label: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  /* ── 봇 생성 ── */
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [roomName, setRoomName] = useState("");
  const [language, setLanguage] = useState<"ko" | "ja" | "en">("ko");

  /* ── 로그인 ── */
  const [authId, setAuthId] = useState("");
  const [authPw, setAuthPw] = useState("");
  const [active, setActive] = useState<{ botId: string; roomName: string } | null>(
    null,
  );

  /* ── 아이템 입력 ── */
  const [category, setCategory] = useState(categories[0]?.key ?? "watch");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");

  function run(fn: () => Promise<{ ok: boolean; msg?: string; err?: string }>) {
    setMsg("");
    setErr("");
    startTransition(async () => {
      const r = await fn();
      if (r.ok) setMsg(r.msg ?? "완료");
      else setErr(r.err ?? "실패");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── 목록 ── */}
      <section className="rounded-lg border">
        <h2 className="border-b px-4 py-2.5 text-sm font-bold">
          봇 {bots.length}개
        </h2>
        {bots.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            아직 봇이 없습니다. 아래에서 만드세요.
          </p>
        ) : (
          <ul className="divide-y">
            {bots.map((b) => (
              <li
                key={b.botId}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm"
              >
                <span className="font-mono text-xs">{b.loginId}</span>
                <span className="font-semibold">{b.roomName}</span>
                <span className="text-xs text-muted-foreground">
                  {b.language} · 아이템 {b.items} · 기록 {b.diaries}
                </span>
                {b.lastActedAt && (
                  <span className="text-xs text-muted-foreground">
                    최근 {b.lastActedAt}
                  </span>
                )}
                {active?.botId === b.botId && (
                  <span className="rounded-sm bg-sale-bg px-1.5 text-xs font-bold text-sale">
                    로그인됨
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 1. 봇 생성 ── */}
      <section className="rounded-lg border p-4">
        <h2 className="text-sm font-bold">1. 봇 만들기</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          유저·방·자격증명을 함께 만듭니다. 비밀번호는 해시로 저장됩니다.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">아이디</span>
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="w-40 rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8자 이상"
              className="w-40 rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">방 이름</span>
            <input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-48 rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">언어</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "ko" | "ja" | "en")}
              className="w-24 rounded-md border px-3 py-2 text-sm"
            >
              <option value="ko">ko</option>
              <option value="ja">ja</option>
              <option value="en">en</option>
            </select>
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await createBot({ loginId, password, roomName, language });
                if (!r.ok) {
                  return {
                    ok: false,
                    err: r.formError ?? Object.values(r.fieldErrors)[0],
                  };
                }
                setPassword("");
                return { ok: true, msg: `봇 "${roomName}" 생성` };
              })
            }
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            만들기
          </button>
        </div>
      </section>

      {/* ── 2. 로그인 ── */}
      <section className="rounded-lg border p-4">
        <h2 className="text-sm font-bold">2. 봇 로그인</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {/* 세션을 만들지 않는다 — 위 주석 참조 */}
          검증만 합니다. 새로고침하면 다시 로그인해야 합니다.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">아이디</span>
            <input
              value={authId}
              onChange={(e) => setAuthId(e.target.value)}
              className="w-40 rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">비밀번호</span>
            <input
              type="password"
              value={authPw}
              onChange={(e) => setAuthPw(e.target.value)}
              className="w-40 rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await verifyBot({ loginId: authId, password: authPw });
                if (!r.ok) return { ok: false, err: r.formError };
                setActive({ botId: r.botId, roomName: r.roomName });
                setAuthPw("");
                return { ok: true, msg: `"${r.roomName}" 으로 로그인` };
              })
            }
            className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-40"
          >
            로그인
          </button>
          {active && (
            <button
              type="button"
              onClick={() => setActive(null)}
              className="px-2 py-2 text-sm text-muted-foreground underline"
            >
              로그아웃
            </button>
          )}
        </div>
      </section>

      {/* ── 3. 올리기 ── */}
      <section className="rounded-lg border p-4">
        <h2 className="text-sm font-bold">3. 올리기</h2>
        {!active ? (
          <p className="mt-2 text-sm text-muted-foreground">
            먼저 봇으로 로그인하세요.
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              <b>{active.roomName}</b> 으로 올립니다. 사진은 플레이스홀더가
              자동 생성됩니다 — 아이템은 사진 1장이 필수입니다 (FR-07-A-03).
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold">카테고리</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-36 rounded-md border px-3 py-2 text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              {/*
                ⚠️ **브랜드는 마스터에서 골라야 한다** (D-043). 타이핑으로 두면
                "목록에서 브랜드를 선택해주세요" 로 계속 막힌다 — 실제로 그
                실패가 났다 (D-150). 유저 폼과 같은 컴포넌트를 쓴다
              */}
              <div className="flex flex-col gap-1 text-sm">
                <span className="font-semibold">브랜드</span>
                <div className="w-52">
                  <BrandSelect value={brand} onChange={setBrand} category={category} />
                </div>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold">
                  모델명 <span className="text-destructive">*</span>
                </span>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-44 rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={pending || !model.trim()}
                onClick={() =>
                  run(async () => {
                    const r = await botPostItem({
                      botId: active.botId,
                      categoryKey: category,
                      brand,
                      model,
                    });
                    if (!r.ok) {
                      return {
                        ok: false,
                        err: r.formError ?? Object.values(r.fieldErrors)[0],
                      };
                    }
                    return { ok: true, msg: "아이템 등록" };
                  })
                }
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                아이템 올리기
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const r = await botPostDiary({ botId: active.botId });
                    if (!r.ok) return { ok: false, err: r.formError };
                    return { ok: true, msg: "기록 작성 (Claude)" };
                  })
                }
                className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-40"
              >
                기록 올리기
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {/* 고유번호를 지어내지 않는다 (D-146) */}
              ⚠️ 고유번호는 넣지 않습니다 — 실재하지 않는 도감이 자동 생성되면
              검증 큐가 가짜로 찹니다 (D-015·D-032).
              <br />
              ⚠️ <b>모델명은 필수</b>입니다 (전 카테고리, D-118). 브랜드는 비워도
              됩니다 — 마스터에 없는 이름은 받지 않습니다 (D-043).
            </p>
          </>
        )}
      </section>

      {pending && <p className="text-sm text-muted-foreground">처리 중…</p>}
      {msg && <p className="text-sm text-sale">{msg}</p>}
      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}
