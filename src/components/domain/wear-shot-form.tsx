"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { createWearShot, updateWearShot } from "@/lib/actions/wear-shot";
import { WEAR_NOTE_MAX as NOTE_MAX } from "@/lib/profile";
import { PhotoUploader } from "@/components/domain/photo-uploader";

/**
 * 오늘의 기록 작성·수정 (S-26, D-148).
 *
 * ## ⚠️ 사진이 필수다
 * 하루기록의 본질이 사진이다. 노트만 남기려면 일기를 쓰는 것이 맞다 (D-054).
 *
 * ## ⚠️ 두 화면이 같은 폼을 쓴다 (D-297)
 * | 화면 | 모드 | 왜 |
 * |---|---|---|
 * | 아이템 상세 | **작성만** | 오늘 이미 남겼으면 폼을 내지 않고 상세로 보낸다 |
 * | 하루기록 상세 | **수정만** | 수정·삭제·댓글이 한 화면에 모인다 |
 *
 * 작성과 수정이 한 컴포넌트인 것은 **입력이 같기 때문**이다(사진 1장 + 노트).
 * 갈라 두면 글자 수 제한·사진 필수 판정이 두 벌이 된다.
 */
export function WearShotForm({
  itemId,
  existing,
  labels,
}: {
  itemId: string;
  /** 오늘 이미 남긴 것 — 있으면 수정 모드 */
  existing?: { id: string; note?: string; photoUrl?: string };
  /** `edit` 는 수정 모드에서만 쓴다 — 작성 화면은 넘기지 않는다 (D-297) */
  labels: {
    title: string;
    edit?: string;
    save: string;
    cancel: string;
    notePlaceholder: string;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<string[]>(
    existing?.photoUrl ? [existing.photoUrl] : [],
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full rounded-lg border py-3 text-center text-sm font-semibold hover:bg-accent"
      >
        {existing ? (labels.edit ?? labels.title) : labels.title}
      </button>
    );
  }

  const left = NOTE_MAX - [...note].length;

  return (
    <div className="rounded-lg border p-4">
      <h2 className="text-sm font-bold">
        {existing ? (labels.edit ?? labels.title) : labels.title}
      </h2>

      <div className="mt-3">
        <PhotoUploader urls={photos} onChange={setPhotos} max={1} />
      </div>

      <label className="mt-3 block">
        <textarea
          value={note}
          onChange={(e) => {
            // 초과분을 잘라내지 않고 입력만 막는다 (일기 FR-01-A-04 와 같은 기준)
            if ([...e.target.value].length > NOTE_MAX) return;
            setNote(e.target.value);
          }}
          rows={2}
          placeholder={labels.notePlaceholder}
          className="w-full resize-y rounded-md border px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-right text-xs text-muted-foreground">
          {left}
        </span>
      </label>

      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending || photos.length === 0}
          onClick={() => {
            setErr("");
            startTransition(async () => {
              const res = existing
                ? await updateWearShot({
                    wearShotId: existing.id,
                    photoUrl: photos[0],
                    note,
                  })
                : await createWearShot({ itemId, photoUrl: photos[0], note });
              if (!res.ok) {
                setErr(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
                return;
              }
              setOpen(false);
              // 목록이 서버 렌더라 다시 그려야 방금 남긴 것이 보인다
              router.refresh();
            });
          }}
          className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {pending ? "저장 중…" : labels.save}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border px-4 py-2.5 text-sm"
        >
          {labels.cancel}
        </button>
      </div>
    </div>
  );
}
