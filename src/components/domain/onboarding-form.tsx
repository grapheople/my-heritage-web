"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { completeOnboarding } from "@/lib/actions/onboarding";
import { recordTimezone } from "@/lib/actions/settings";
import { PhotoUploader } from "@/components/domain/photo-uploader";

/**
 * S-24 가입 직후 프로필 설정 (myroom F-09).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 방 이름만 필수 · 나머지 스킵 가능 | D-123, FR-09-A·B |
 * | 단계 2는 **한 화면** | D-123 |
 * | 스킵한 항목은 설정에서 언제든 | FR-09-B-03 |
 * | 타임존은 **묻지 않고** 진입 시 기록 | D-122, FR-09-C |
 *
 * ## ⚠️ 스킵이 손실이 아니어야 스킵할 수 있다
 * 건너뛴 항목을 나중에 넣을 수 없으면 유저는 "지금 안 하면 못 한다"고 읽고,
 * 그 압박이 곧 이탈이다. 화면에서 그 사실을 **말로** 알린다 — 설정에 있다는
 * 것을 모르면 없는 것과 같다.
 */
const CATEGORY_KEYS = [
  "watch", "shoes", "bicycle", "apparel", "camping", "deskterior",
] as const;

export function OnboardingForm({
  roomNameMax,
  categoryLabels,
}: {
  roomNameMax: number;
  /** key → 표시 이름. 서버가 현재 언어로 넘긴다 */
  categoryLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [roomName, setRoomName] = useState("");
  const [bio, setBio] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  /**
   * ⚠️ **화면이 열릴 때 기록한다. 제출이 아니다** (FR-09-C-03).
   *
   * 제출에 묶으면 **단계 2를 건너뛴 유저 전원이 UTC 로 남는다** — 그게 다수
   * 경로일 가능성이 높다. 경험치 1일 경계가 거기 달려 있다 (D-056).
   *
   * 실패해도 아무것도 하지 않는다. 유저가 요청한 적 없는 동작이라 여기서
   * 오류를 띄우면 가입 첫 화면에 영문 모를 메시지가 뜬다.
   */
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) void recordTimezone(tz);
  }, []);

  const submit = (categories: string[]) => {
    setError("");
    startTransition(async () => {
      const res = await completeOnboarding({
        roomName,
        bio: bio.trim() || undefined,
        imageUrl: photos[0],
        preferredCategories: categories,
      });
      if (res.ok) router.replace("/me");
      else setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
    });
  };

  const nameOk = roomName.trim().length > 0;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-7 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">방을 만들었어요</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          이름만 정하면 시작할 수 있어요. 나머지는 건너뛰어도 괜찮아요.
        </p>
      </div>

      {/* ── 단계 1 — 필수 ── */}
      <div>
        <label className="text-sm font-semibold" htmlFor="room-name">
          방 이름 <span className="text-destructive">*</span>
        </label>
        <input
          id="room-name"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          maxLength={roomNameMax}
          placeholder="예: 파란 서랍"
          className="mt-1.5 w-full rounded-md border px-3 py-2.5 text-sm"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {/* 유일값이 아니다 (FR-05-A-06) — 남과 같아도 된다고 먼저 말해준다 */}
          다른 사람과 같은 이름이어도 괜찮아요 · {[...roomName].length}/{roomNameMax}
        </p>
      </div>

      {/* ── 단계 2 — 전부 선택 ── */}
      <div className="flex flex-col gap-5 border-t pt-6">
        <p className="text-sm font-semibold">
          여기부터는 선택이에요
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            설정에서 언제든 바꿀 수 있어요
          </span>
        </p>

        <div>
          <span className="text-sm font-semibold">방 사진</span>
          {/* 아이템 사진과 같은 업로드 경로를 쓴다 — EXIF 는 서버에서 제거된다 */}
          <div className="mt-1.5">
            <PhotoUploader urls={photos} onChange={setPhotos} max={1} />
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold" htmlFor="bio">
            소개
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
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              고르면 첫 화면을 그것부터 보여줘요
            </span>
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {CATEGORY_KEYS.map((key) => {
              const on = picked.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setPicked(
                      on ? picked.filter((k) => k !== key) : [...picked, key],
                    )
                  }
                  className={
                    on
                      ? "rounded-full border border-primary bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground"
                      : "rounded-full border px-3.5 py-1.5 text-sm hover:bg-accent"
                  }
                >
                  {categoryLabels[key] ?? key}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={pending || !nameOk}
          onClick={() => submit(picked)}
          className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {pending ? "저장 중…" : "시작하기"}
        </button>
        {/*
          ⚠️ 스킵도 **방 이름은 필요하다** (FR-09-A-02). 이름이 없을 때 이
          버튼을 눌러도 통과시키면 빈 이름 방이 생긴다. 그래서 같은 조건으로
          막고, 대신 문구로 "선택 항목만 건너뛴다"는 것을 분명히 한다
        */}
        <button
          type="button"
          disabled={pending || !nameOk}
          onClick={() => submit([])}
          className="w-full rounded-lg border py-3 text-sm disabled:opacity-40"
        >
          선택 항목은 나중에 할래요
        </button>
      </div>

      {!nameOk && (
        <p className="-mt-4 text-center text-xs text-muted-foreground">
          방 이름은 꼭 필요해요
        </p>
      )}
    </div>
  );
}
