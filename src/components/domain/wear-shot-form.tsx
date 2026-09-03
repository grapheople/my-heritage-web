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
 * ## ⚠️ 하루 1장이므로 "오늘 이미 있으면 수정"이다
 * 새로 만들려 하면 서버가 유니크 제약으로 막는다. 화면이 미리 알고 **수정
 * 모드로 열어** 유저가 헛수고하지 않게 한다.
 */
export function WearShotForm({
  itemId,
  existing,
  labels,
}: {
  itemId: string;
  /** 오늘 이미 남긴 것 — 있으면 수정 모드 */
  existing?: { id: string; note?: string; photoUrl?: string };
  labels: { title: string; edit: string; save: string; cancel: string; notePlaceholder: string };
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
        {existing ? labels.edit : labels.title}
      </button>
    );
  }

  const left = NOTE_MAX - [...note].length;

  return (
    <div className="rounded-lg border p-4">
      <h2 className="text-sm font-bold">
        {existing ? labels.edit : labels.title}
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
