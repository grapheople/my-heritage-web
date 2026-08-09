"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { createDiary, updateDiary } from "@/lib/actions/diary";
import { StatusBadge } from "./status-badge";
import { DIARY_MAX_LENGTH, MAX_PHOTOS as DIARY_MAX_PHOTOS } from "@/lib/constants";
import { PhotoUploader } from "./photo-uploader";

/**
 * 일기 작성·수정 폼 (S-06).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 본문 **1000자**. 언어에 따라 다르게 적용하지 않는다 | D-053, FR-01-A-01·02 |
 * | 남은 글자 수 표시 | FR-01-A-03 |
 * | **초과 시 잘라내지 않고 입력을 차단** | FR-01-A-04 |
 * | 사진 최대 10장, **필수 아님** | D-037, FR-01-A-05·06 |
 * | 본문과 사진이 **모두** 비면 저장 차단 | FR-01-A-07 |
 * | 작성 시점에 공개/비공개 선택 | FR-03-A-01 |
 * | 본인 소유 아이템만 연결. **비공개 아이템도 포함** | FR-02-A-04·05 |
 * | 아이템 연결은 필수가 아니다 | FR-02-A-03 |
 *
 * ⚠️ **글자 수는 유니코드 문자 수로 센다.** `String.length`는 UTF-16 코드 유닛
 * 이라 이모지가 2로 세어진다. `[...text].length`를 쓴다 — 언어별로 상한이
 * 달라지면 안 된다 (FR-01-A-02).
 */
export type LinkableItem = {
  id: string;
  name: string;
  visibility: "PUBLIC" | "PRIVATE";
};

export function DiaryForm({
  items,
  initial,
  diaryId,
}: {
  /** 본인 소유 아이템 — 비공개 포함 (FR-02-A-05) */
  items: LinkableItem[];
  initial?: {
    body: string;
    visibility: "PUBLIC" | "PRIVATE";
    photos: string[];
    itemIds: string[];
  };
  /** 있으면 수정, 없으면 신규 — **수정은 경험치를 주지 않는다** (FR-01-C-03) */
  diaryId?: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [body, setBody] = useState(initial?.body ?? "");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">(
    initial?.visibility ?? "PUBLIC",
  );
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? []);
  const [linked, setLinked] = useState<string[]>(initial?.itemIds ?? []);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  // 유니코드 문자 수 — 이모지를 1로 센다
  const length = [...body].length;
  const remaining = DIARY_MAX_LENGTH - length;
  const empty = body.trim().length === 0 && photos.length === 0;

  function onBodyChange(next: string) {
    // 초과분을 잘라내지 않는다. 이미 상한이면 추가 입력만 막는다 (FR-01-A-04)
    if ([...next].length > DIARY_MAX_LENGTH) return;
    setBody(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // 클라이언트 검증은 **즉시 피드백용**이다. 진짜 검증은 Server Action 이
    // 한다 — 클라이언트만 믿으면 요청을 직접 보내는 것으로 우회된다
    if (empty) return setError(t("diary.errEmpty"));
    setError("");

    startTransition(async () => {
      const payload = { body, visibility, photoUrls: photos, itemIds: linked };
      // ⚠️ 분기해서 받는다 — `updateDiary` 는 id 를 돌려주지 않는다
      const res = diaryId
        ? await updateDiary(diaryId, payload)
        : await createDiary(payload);
      if (!res.ok) {
        setError(res.formError ?? Object.values(res.fieldErrors)[0] ?? "");
        return;
      }
      const target = diaryId ?? ("diaryId" in res ? res.diaryId : undefined);
      if (!target) return;
      // ⚠️ **저장하면 그 기록으로 보낸다.** 예전에는 폼에 머물러서 저장이
      // 됐는지 알 수 없었고, 다시 누르면 같은 내용이 하나 더 생겼다.
      // `replace` 라 뒤로가기가 폼으로 돌아오지 않는다 — 그 폼은 이미 저장된
      // 내용을 들고 있어 중복 저장으로 이어진다
      router.replace(`/diaries/${target}`);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {/* 공개 범위 (FR-03-A-01) */}
      <fieldset>
        <legend className="text-sm font-semibold">{t("diary.visibilityLabel")}</legend>
        <div className="mt-2 flex gap-2">
          {(["PUBLIC", "PRIVATE"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisibility(v)}
              aria-pressed={visibility === v}
              className={
                visibility === v
                  ? "rounded-full border border-foreground bg-foreground px-4 py-1.5 text-sm font-semibold text-background"
                  : "rounded-full border px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              }
            >
              {t(`diary.visibility.${v === "PUBLIC" ? "public" : "private"}`)}
            </button>
          ))}
        </div>
      </fieldset>

      {/* 본문 */}
      <div>
        <label className="text-sm font-semibold" htmlFor="diary-body">
          {t("diary.bodyLabel")}
        </label>
        <textarea
          id="diary-body"
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          rows={10}
          placeholder={t("diary.bodyPlaceholder")}
          className="mt-1.5 w-full resize-y rounded-md border px-3 py-2 text-sm leading-relaxed"
        />
        <div className="mt-1 flex justify-between text-xs">
          {/* 마크다운·자동 링크가 없다는 것을 미리 알린다 (D-055) */}
          <span className="text-muted-foreground">{t("diary.plainTextHint")}</span>
          <span
            className={remaining === 0 ? "font-semibold text-warn" : "text-muted-foreground"}
          >
            {length} / {DIARY_MAX_LENGTH}
          </span>
        </div>
      </div>

      {/* 사진 — 필수 아님 (FR-01-A-06) */}
      <div>
        <span className="text-sm font-semibold">
          {t("diary.photosLabel")}{" "}
          <span className="font-normal text-muted-foreground">
            {t("diary.optional")}
          </span>
        </span>
        <PhotoUploader urls={photos} onChange={setPhotos} max={DIARY_MAX_PHOTOS} />
      </div>

      {/* 아이템 연결 — 필수 아님. 비공개 아이템도 고를 수 있다 (FR-02-A-03·05) */}
      <div>
        <span className="text-sm font-semibold">
          {t("diary.linkItemsLabel")}{" "}
          <span className="font-normal text-muted-foreground">
            {t("diary.optional")}
          </span>
        </span>
        <ul className="mt-2 flex flex-wrap gap-2">
          {items.map((item) => {
            const on = linked.includes(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setLinked((prev) =>
                      on ? prev.filter((x) => x !== item.id) : [...prev, item.id],
                    )
                  }
                  className={
                    on
                      ? "flex items-center gap-1.5 rounded-full border border-foreground bg-foreground px-3 py-1.5 text-sm font-semibold text-background"
                      : "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                  }
                >
                  {item.name}
                  {item.visibility === "PRIVATE" && !on && (
                    <StatusBadge variant="private" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={empty || pending}
        className="rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
      >
        {pending ? t("common.saving") : t("common.save")}
      </button>
    </form>
  );
}
