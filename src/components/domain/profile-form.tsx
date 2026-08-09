"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "@/lib/actions/settings";
import { PhotoUploader } from "@/components/domain/photo-uploader";

/**
 * S-16 프로필 설정 — 방 이름 · 소개 · 사진 · 관심 카테고리.
 *
 * ## ⚠️ 이 화면이 없으면 온보딩의 스킵이 성립하지 않는다 (FR-09-B-03)
 * S-24 에서 건너뛴 항목을 여기서 넣을 수 없으면, 유저는 "지금 안 하면 못
 * 한다"고 읽고 그 압박이 곧 이탈이다. 스킵 버튼을 붙일 수 있는 근거가 여기다.
 *
 * ⚠️ **예전에는 저장 버튼이 없었다.** 입력칸은 있는데 어떤 액션에도 연결돼
 * 있지 않아 값이 남지 않았다 — `updateProfile` 을 호출하는 코드가 0곳이었다.
 */
const CATEGORY_KEYS = [
  "watch", "shoes", "bicycle", "apparel", "camping", "deskterior",
] as const;

export function ProfileForm({
  initial,
  categoryLabels,
  roomNameMax,
  labels,
}: {
  initial: {
    roomName: string;
    bio?: string;
    imageUrl?: string;
    preferredCategories: string[];
  };
  categoryLabels: Record<string, string>;
  roomNameMax: number;
  labels: { roomName: string; roomNameHint: string; bio: string };
}) {
  const [roomName, setRoomName] = useState(initial.roomName);
  const [bio, setBio] = useState(initial.bio ?? "");
  const [photos, setPhotos] = useState<string[]>(
    initial.imageUrl ? [initial.imageUrl] : [],
  );
  const [picked, setPicked] = useState<string[]>(initial.preferredCategories);
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
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {/* 용도를 밝힌다 — 왜 물었는지 모르면 고를 이유가 없다 (D-124) */}
            첫 화면에 이 카테고리부터 보여줘요
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
                  setPicked(on ? picked.filter((k) => k !== key) : [...picked, key])
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
