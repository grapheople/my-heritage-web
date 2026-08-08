"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";

/**
 * 사진 업로드 (D-101, D-037).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 최대 10장 | D-037, FR-07-A-02 |
 * | **첫 장이 대표 이미지** | FR-07-A-04 |
 * | **순서 변경 가능** | FR-07-A-05 |
 * | 아이템은 1장 필수, 일기는 선택 | FR-07-A-03 / diary FR-01-A-06 |
 *
 * ## ⚠️ 업로드를 등록과 분리한 이유
 * 사진 10장을 등록 요청에 실으면 **폼 제출이 타임아웃에 걸린다.** 업로드는
 * `/api/upload` 가 먼저 끝내고, 폼은 **URL 만** 들고 있다가 저장 시 함께 보낸다.
 *
 * ## ⚠️ EXIF 는 서버가 지운다
 * 클라이언트에서 지우는 방법도 있지만 **우회된다** — 요청을 직접 보내면
 * 그만이다. 위치정보 제거는 `lib/storage.ts` 에서만 일어난다 (D-101).
 *
 * 실패한 장은 목록에 넣지 않는다. "올라간 것처럼 보이는데 저장은 안 된" 상태가
 * 제일 나쁘다.
 */
/** 두 자리를 맞바꾼 새 배열. 원본을 건드리지 않는다 */
function swap(list: string[], a: number, b: number): string[] {
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

export function PhotoUploader({
  urls,
  onChange,
  max = 10,
  error,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  error?: string;
}) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState("");
  const [pending, startTransition] = useTransition();

  function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    // 남은 자리만큼만 받는다. 넘치면 조용히 자르지 않고 알린다
    const room = max - urls.length;
    const chosen = [...files].slice(0, room);
    if (files.length > room) setFailed(t("reg.photoMax", { max }));

    startTransition(async () => {
      const added: string[] = [];
      for (const file of chosen) {
        const body = new FormData();
        body.append("file", file);
        try {
          const res = await fetch("/api/upload", { method: "POST", body });
          const data = (await res.json()) as { url?: string; error?: string };
          if (res.ok && data.url) added.push(data.url);
          else setFailed(data.error ?? t("error.generic"));
        } catch {
          setFailed(t("error.generic"));
        }
      }
      if (added.length > 0) onChange([...urls, ...added]);
    });
  }

  return (
    <div>
      <div className="mt-2 flex flex-wrap gap-2">
        {urls.map((url, i) => (
          <span key={url} className="relative size-16 overflow-hidden rounded-md border bg-muted">
            <Image src={url} alt="" fill sizes="64px" className="object-cover" />
            {/* 첫 장이 대표 이미지 (FR-07-A-04) */}
            {i === 0 && (
              <span className="absolute bottom-0 left-0 rounded-tr-md rounded-bl-md bg-foreground px-1 text-[10px] font-bold text-background">
                {t("reg.cover")}
              </span>
            )}
            <button
              type="button"
              aria-label={t("common.delete")}
              onClick={() => onChange(urls.filter((u) => u !== url))}
              className="absolute top-0 right-0 rounded-bl-md bg-foreground/80 px-1 text-[10px] text-background"
            >
              ×
            </button>
            {/* 순서 변경 (FR-07-A-05). 드래그 대신 좌우 이동 버튼을 쓴다 —
                드래그는 터치·키보드 접근성을 따로 만들어야 한다 */}
            {i > 0 && (
              <button
                type="button"
                aria-label={t("reg.photoMoveLeft")}
                onClick={() => onChange(swap(urls, i, i - 1))}
                className="absolute bottom-0 right-0 rounded-tl-md bg-foreground/80 px-1 text-[10px] text-background"
              >
                ‹
              </button>
            )}
          </span>
        ))}

        {urls.length < max && (
          <button
            type="button"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
            aria-label={t("diary.addPhoto")}
            className="size-16 rounded-md border border-dashed text-xl text-muted-foreground hover:bg-accent disabled:opacity-40"
          >
            {pending ? "…" : "+"}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        // HEIC 를 빼면 iPhone 기본 촬영본이 막힌다 (D-101)
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        hidden
        onChange={(e) => {
          pick(e.target.files);
          // 같은 파일을 다시 고를 수 있게 비운다
          e.target.value = "";
        }}
      />

      <p className="mt-1.5 text-xs text-muted-foreground">
        {urls.length} / {max}
      </p>
      {(error || failed) && (
        <p className="mt-1.5 text-xs text-destructive">{error || failed}</p>
      )}
    </div>
  );
}
