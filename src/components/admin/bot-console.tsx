"use client";

import { useState, useTransition } from "react";
import {
  botPostDiary,
  botPostItem,
  botResearchItem,
  botUploadPhoto,
  createBot,
  verifyBot,
} from "@/lib/actions/bot";
import { AdminBrandPicker } from "@/components/admin/admin-brand-picker";
import { BotItemFields } from "@/components/admin/bot-item-fields";
// 타입만 가져온다 — `lib/bot/fields.ts` 는 prisma 를 import 하므로 값으로
// 들고 오면 클라이언트 번들에 들어간다
import type { BotField } from "@/lib/bot/fields";

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
  /** 카테고리 → 채울 항목. 서버에서 A-02 조합을 읽어 넘긴다 (D-153) */
  fieldsByCategory,
}: {
  bots: Bot[];
  categories: { key: string; label: string }[];
  fieldsByCategory: Record<string, BotField[]>;
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
  /** 힌트 — 어떤 제품을 찾을지. 비우면 브랜드의 대표 제품을 고르게 한다 */
  const [hint, setHint] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [nickname, setNickname] = useState("");
  /** 자료 수집에서 버린 값 — 조용히 버리면 왜 빈칸인지 알 수 없다 */
  const [dropped, setDropped] = useState<string[]>([]);
  /** 직접 올린 사진. 비면 플레이스홀더가 만들어진다 (D-154) */
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const fields = fieldsByCategory[category] ?? [];
  // 매칭 키가 모두 채워졌을 때만 도감에 연결된다 (D-032·D-153).
  // 서버가 같은 판정을 다시 한다 — 화면은 미리 보여주기만 한다
  const keyFields = fields.filter((f) => f.isMatchingKey);
  // ⚠️ **브랜드를 빠뜨리지 않는다.** 옷·캠핑·데스크테리어·자전거는 브랜드가
  // 매칭 키 구성 요소다 (D-118). 브랜드는 별도 state 라 `values` 에 없다 —
  // 빼면 서버 판정과 반대로 표시된다
  const codexLinked =
    keyFields.length > 0 &&
    keyFields.every((f) =>
      f.key === "brand" ? brand.trim() : values[f.key]?.trim(),
    );

  /** 카테고리를 바꾸면 채운 값은 버린다 — 속성 조합이 다르다 */
  function changeCategory(key: string) {
    setCategory(key);
    setValues({});
    setNickname("");
    setDropped([]);
    setPhotos([]);
  }

  function setValue(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  /**
   * 사진 업로드 (D-154).
   *
   * ⚠️ **`startTransition` 을 쓰지 않는다.** 여러 장을 순차로 올리는 동안
   * 진행 상태를 따로 보여야 하고, 한 장이 실패해도 나머지는 살린다 —
   * 트랜지션 하나로 묶으면 어느 장이 실패했는지 알 수 없다.
   */
  async function upload(botId: string, files: FileList) {
    setMsg("");
    setErr("");
    setUploading(true);
    const added: string[] = [];
    const failed: string[] = [];
    // ⚠️ 선택 순서를 지킨다 — **첫 장이 대표 이미지**다 (FR-07-A-04).
    // `Promise.all` 은 완료 순서가 섞이므로 쓰지 않는다
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.set("botId", botId);
      form.set("file", file);
      const r = await botUploadPhoto(form);
      if (r.ok) added.push(r.url);
      else failed.push(`${file.name}: ${r.formError ?? "실패"}`);
    }
    setPhotos((p) => [...p, ...added]);
    setUploading(false);
    if (added.length > 0) setMsg(`사진 ${added.length}장 업로드`);
    if (failed.length > 0) setErr(failed.join(" · "));
  }

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
                // ⚠️ 올려둔 사진은 **이전 봇의 경로**에 저장돼 있다. 봇이
                // 바뀌면 버린다 — 남의 방 사진을 붙여 올리게 될 이유가 없다
                setPhotos([]);
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
              onClick={() => {
                setActive(null);
                setPhotos([]);
              }}
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
              <b>{active.roomName}</b> 으로 올립니다. 아이템은 사진 1장이
              필수이므로(FR-07-A-03), 직접 올리지 않으면 플레이스홀더가 자동
              생성됩니다.
            </p>

            {/* ── 3-1. 대상 지정 + 자료 수집 ── */}
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold">카테고리</span>
                <select
                  value={category}
                  onChange={(e) => changeCategory(e.target.value)}
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
                "목록에서 브랜드를 선택해주세요" 로 계속 막힌다 (D-150).
                ⚠️ 유저 폼의 `BrandSelect` 를 쓸 수 없다 — `useTranslations` 를
                쓰는데 **어드민은 `[locale]` 밖이라 i18n 컨텍스트가 없다** (D-151)
              */}
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold">브랜드</span>
                <AdminBrandPicker
                  value={brand}
                  onChange={setBrand}
                  category={category}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold">힌트</span>
                <input
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  placeholder="예: SKX007 다이버"
                  className="w-56 rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const r = await botResearchItem({
                      botId: active.botId,
                      categoryKey: category,
                      brand,
                      hint,
                    });
                    if (!r.ok) return { ok: false, err: r.formError };
                    // 손으로 채운 값을 지우지 않는다 — 수집된 값만 덮어쓴다
                    setValues((v) => ({ ...v, ...r.values }));
                    if (r.nickname) setNickname(r.nickname);
                    setDropped(r.dropped);
                    const n = Object.keys(r.values).length;
                    return { ok: true, msg: `자료 수집 — ${n}개 항목 채움` };
                  })
                }
                className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-40"
              >
                자료 수집해서 채우기
              </button>
            </div>

            {/* ── 3-2. 채운 값 확인·수정 ── */}
            <div className="mt-4 border-t pt-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {/* 사람이 한 번 보는 단계를 남긴다 (D-153) */}
                  수집된 값을 <b>확인·수정한 뒤</b> 등록하세요. 지어낸 고유값은
                  실재하지 않는 도감을 만듭니다 (D-015).
                </p>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold">
                    별칭
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      비우면 자동 생성
                    </span>
                  </span>
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-44 rounded-md border px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="mt-3">
                <BotItemFields
                  fields={fields}
                  values={values}
                  onChange={setValue}
                  disabled={pending}
                />
              </div>

              {/* ── 사진 (D-154) ── */}
              <div className="mt-4 border-t pt-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold">사진</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    multiple
                    disabled={pending || uploading}
                    onChange={(e) => {
                      const files = e.target.files;
                      if (files && files.length > 0) upload(active.botId, files);
                      // 같은 파일을 다시 고를 수 있게 비운다
                      e.target.value = "";
                    }}
                    className="text-sm"
                  />
                  {uploading && (
                    <span className="text-xs text-muted-foreground">
                      업로드 중…
                    </span>
                  )}
                  {photos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPhotos([])}
                      className="text-xs text-muted-foreground underline"
                    >
                      전체 비우기
                    </button>
                  )}
                </div>

                {photos.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {/* 사진 1장 필수 (FR-07-A-03) — 없으면 만들어 넣는다 */}
                    비워두면 <b>플레이스홀더가 자동 생성</b>됩니다. 직접 올리면
                    그 사진을 씁니다 — <b>첫 장이 대표 이미지</b>입니다
                    (FR-07-A-04).
                  </p>
                ) : (
                  <>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {photos.map((url, i) => (
                        <li key={url} className="relative">
                          {/*
                            어드민 전용 화면이라 `next/image` 최적화를 붙이지
                            않는다 — 저장 시 이미 정방형·500KB 이하다 (D-128·D-129)
                          */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt=""
                            className="size-20 rounded-md border object-cover"
                          />
                          {i === 0 && (
                            <span className="absolute left-1 top-1 rounded-sm bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                              대표
                            </span>
                          )}
                          <button
                            type="button"
                            aria-label="사진 제거"
                            onClick={() =>
                              setPhotos((p) => p.filter((u) => u !== url))
                            }
                            className="absolute right-1 top-1 rounded-sm bg-background/90 px-1 text-xs font-bold"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {photos.length}장 · 첫 장이 대표입니다. 저장 시 정방형으로
                      중앙 크롭되고 500KB 이하로 압축됩니다 (D-128·D-129).
                    </p>
                  </>
                )}
              </div>

              {dropped.length > 0 && (
                <div className="mt-3 rounded-md border border-warn bg-warn-bg p-2 text-xs text-warn">
                  <b>버린 값 {dropped.length}건</b> — 저장 가능한 형식이 아니어서
                  비웠습니다.
                  <ul className="mt-1 list-disc pl-4">
                    {dropped.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={pending || uploading || !values.model?.trim()}
                  onClick={() =>
                    run(async () => {
                      const r = await botPostItem({
                        botId: active.botId,
                        categoryKey: category,
                        brand,
                        values,
                        nickname,
                        photoUrls: photos,
                      });
                      if (!r.ok) {
                        return {
                          ok: false,
                          err: r.formError ?? Object.values(r.fieldErrors)[0],
                        };
                      }
                      setValues({});
                      setNickname("");
                      setDropped([]);
                      setPhotos([]);
                      const pic =
                        photos.length > 0
                          ? `사진 ${photos.length}장`
                          : "플레이스홀더 사진";
                      return {
                        ok: true,
                        msg: r.codexLinked
                          ? `아이템 등록 — 도감 연결됨 · ${pic}`
                          : `아이템 등록 — 도감 연결 없음(고유값 비어 있음) · ${pic}`,
                      };
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
                {keyFields.length > 0 && (
                  <span
                    className={`text-xs ${codexLinked ? "text-warn" : "text-muted-foreground"}`}
                  >
                    {codexLinked
                      ? `⚠️ 고유값(${keyFields.map((f) => f.label).join("·")})이 채워져 도감이 생성·연결됩니다`
                      : `도감 연결 없음 — 고유값(${keyFields.map((f) => f.label).join("·")})을 비워두면 안전합니다`}
                  </span>
                )}
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              ⚠️ <b>모델명은 필수</b>입니다 (전 카테고리, D-118). 브랜드는 비워도
              됩니다 — 마스터에 없는 이름은 받지 않습니다 (D-043).
              <br />
              ⚠️ 프롬프트는 <code>prompts/bot-item-research.md</code> 입니다 —
              코드를 고치지 않고 문구를 조정할 수 있습니다 (D-153).
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
