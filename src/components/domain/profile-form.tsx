"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { CATEGORY_KEYS } from "@/lib/categories";
import { updateProfile } from "@/lib/actions/settings";
import { PhotoUploader } from "@/components/domain/photo-uploader";

/**
 * S-16 프로필 설정 — 방 이름 · 소개 · 사진 · **관심 카테고리 · 관심 언어권**.
 *
 * ## ⚠️ 관심 언어권은 S-12 "언어 설정" 과 **다른 것이다** (D-274)
 * | | 무엇 | 어디 |
 * |---|---|---|
 * | 서비스 언어 (`User.language`) | *내* 화면이 보이는 말 | S-12 |
 * | 관심 언어권 | *남의* 방을 볼지 말지 | **여기** |
 *
 * 같은 "언어"라는 말을 쓰므로 **문구로 갈라줘야 한다.** 합쳐 두면 한국어 UI 를
 * 쓰는 사람이 일본 컬렉터를 못 보게 되고, 그건 D-027 이 언어권 기본값을
 * `전체` 로 둔 이유를 정면으로 뒤집는다.
 *
 * ## ⚠️ 이 화면이 없으면 온보딩의 스킵이 성립하지 않는다 (FR-09-B-03)
 * S-24 에서 건너뛴 항목을 여기서 넣을 수 없으면, 유저는 "지금 안 하면 못
 * 한다"고 읽고 그 압박이 곧 이탈이다. 스킵 버튼을 붙일 수 있는 근거가 여기다.
 *
 * ⚠️ **예전에는 저장 버튼이 없었다.** 입력칸은 있는데 어떤 액션에도 연결돼
 * 있지 않아 값이 남지 않았다 — `updateProfile` 을 호출하는 코드가 0곳이었다.
 */
/**
 * 켜고 끄는 칩 — 관심 카테고리·관심 언어권 공용 (D-275).
 *
 * ## ⚠️ 선택 상태를 **면 색 하나로만** 표현하지 않는다
 * 팔레트가 전부 무채색이라(DS-1·D-079) 켜짐/꺼짐에 쓸 수 있는 색이 없다.
 * 초판은 `bg-primary`(검정) 대 `border`(`oklch(.922)` — 흰 배경 위에서 거의
 * 안 보인다) 였고, 실제로 **"뭐가 골라진 건지 모르겠다"** 는 말을 들었다.
 *
 * 두 가지가 겹쳐 있었다:
 * - 미선택 칩이 **칩으로 안 읽힌다** — 테두리가 배경과 8% 차이다
 * - 검은 알약은 이 시스템에서 **주 버튼**의 모양이다 (`--primary` 는 "검정
 *   그 자체" 가 D-079 의 결론) — 선택 표시가 아니라 누르는 버튼으로 읽힌다
 *
 * ## ⚠️ 색을 더하는 것으로 풀지 않는다
 * DS-1 이 크롬에 유채색을 금지한다. 색 대신 **모양 채널(`✓`)** 을 얹는다 —
 * 무채색에서도, 색각 이상에서도, 흑백 인쇄에서도 살아남는 유일한 축이다.
 * 미선택에는 옅은 면(`bg-muted`)을 줘서 칩 무리가 **한 세트로** 읽히게 한다.
 *
 * ## ⚠️ `hover:bg-accent` 를 쓸 수 없다
 * `--muted` · `--accent` · `--secondary` 가 **전부 `oklch(.97)` 로 같은 값**
 * 이다. `bg-muted` 위에 `hover:bg-accent` 를 걸면 아무 일도 일어나지 않는다 —
 * 그래서 호버는 면이 아니라 **테두리**로 낸다.
 *
 * ## ⚠️ 글자 굵기를 상태에 따라 바꾸지 않는다
 * 초판은 선택에만 `font-semibold` 라 **누를 때마다 칩 너비가 흔들렸다.**
 * 굵기는 고정하고 `✓` 만 늘어난다.
 *
 * ⚠️ **`aria-pressed` 가 상태 그 자체다.** 없으면 스크린리더에는 켜짐/꺼짐이
 * 아예 전달되지 않는다 — 시각 대비를 아무리 올려도 닿지 않는 문제다.
 */
function ChoiceChip({
  on,
  label,
  onToggle,
}: {
  on: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors " +
        (on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-transparent bg-muted text-foreground hover:border-foreground/25")
      }
    >
      {/* 아이콘은 장식이 아니라 **상태**다. 다만 `aria-pressed` 가 이미 말하고
          있으므로 보조기기에는 중복해서 읽히지 않게 숨긴다 */}
      {on && <Check aria-hidden className="size-3.5" />}
      {label}
    </button>
  );
}

export function ProfileForm({
  initial,
  categoryLabels,
  languageKeys,
  languageLabels,
  roomNameMax,
  labels,
}: {
  initial: {
    roomName: string;
    bio?: string;
    imageUrl?: string;
    preferredCategories: string[];
    preferredLanguages: string[];
  };
  categoryLabels: Record<string, string>;
  /** 서비스가 지원하는 언어 — `i18n/routing.ts` 가 단일 출처다 (D-274) */
  languageKeys: string[];
  languageLabels: Record<string, string>;
  roomNameMax: number;
  labels: { roomName: string; roomNameHint: string; bio: string };
}) {
  const [roomName, setRoomName] = useState(initial.roomName);
  const [bio, setBio] = useState(initial.bio ?? "");
  const [photos, setPhotos] = useState<string[]>(
    initial.imageUrl ? [initial.imageUrl] : [],
  );
  const [picked, setPicked] = useState<string[]>(initial.preferredCategories);
  const [langs, setLangs] = useState<string[]>(initial.preferredLanguages);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        setDone(false);
        startTransition(async () => {
          const res = await updateProfile({
            roomName,
            bio: bio.trim() || undefined,
            // 사진을 지운 경우 `null` 을 보내야 한다 — `undefined` 는 "안 보냄"이다
            imageUrl: photos[0] ?? null,
            preferredCategories: picked,
            preferredLanguages: langs,
          });
          if (res.ok) setDone(true);
          else setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
        });
      }}
      className="mt-5 flex flex-col gap-4"
    >
      <div>
        <label className="text-sm font-semibold" htmlFor="room-name">
          {labels.roomName}
        </label>
        <input
          id="room-name"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          maxLength={roomNameMax}
          className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
        />
        {/* 유일값이 아니다 (FR-05-A-06) */}
        <p className="mt-1.5 text-xs text-muted-foreground">
          {labels.roomNameHint} · {[...roomName].length}/{roomNameMax}
        </p>
      </div>

      <div>
        <span className="text-sm font-semibold">방 사진</span>
        <div className="mt-1.5">
          <PhotoUploader urls={photos} onChange={setPhotos} max={1} />
        </div>
      </div>

      <div>
        <label className="text-sm font-semibold" htmlFor="bio">
          {labels.bio}
        </label>
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className="mt-1.5 w-full resize-y rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <span className="text-sm font-semibold">
          관심 있는 카테고리
        </span>
        {/*
          ⚠️ **용도를 정확히 쓴다** (D-124·D-271). 옛 문구는 "첫 화면에 이
          카테고리부터 보여줘요" 였는데, 이제 순서가 아니라 **범위**를 정한다 —
          홈·마켓·등록에 관심사만 나오고 도감 선택지도 여기서 좁혀진다.
          "부터" 로 읽으면 나머지도 아래에 있는 줄 알고 스크롤하게 된다
        */}
        <p className="mt-1 text-xs text-muted-foreground">
          홈·마켓·등록 화면이 여기서 고른 카테고리만 보여줘요. 고르지 않으면
          전체를 보여줍니다.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {CATEGORY_KEYS.map((key) => {
            const on = picked.includes(key);
            return (
              <ChoiceChip
                key={key}
                on={on}
                label={categoryLabels[key] ?? key}
                onToggle={() =>
                  setPicked(on ? picked.filter((k) => k !== key) : [...picked, key])
                }
              />
            );
          })}
        </div>
      </div>

      {/* ── 관심 언어권 (D-274) ── */}
      <div>
        <span className="text-sm font-semibold">관심 있는 언어권</span>
        {/*
          ⚠️ **바로 아래 "언어 설정"(S-12)과 헷갈리게 두면 안 된다.** 그쪽은
          화면이 보이는 말이고 여기는 누구의 방을 볼지다. 문구로 갈라준다
        */}
        <p className="mt-1 text-xs text-muted-foreground">
          홈 피드에 이 언어를 쓰는 사람의 방만 보여줘요. 고르지 않으면 전체를
          보여줍니다 — 화면이 보이는 말은 아래 <b>언어 설정</b>에서 바꿉니다.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {languageKeys.map((key) => {
            const on = langs.includes(key);
            return (
              <ChoiceChip
                key={key}
                on={on}
                label={languageLabels[key] ?? key}
                onToggle={() =>
                  setLangs(on ? langs.filter((l) => l !== key) : [...langs, key])
                }
              />
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
        {done && <span className="text-sm text-sale">저장했어요</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </form>
  );
}
