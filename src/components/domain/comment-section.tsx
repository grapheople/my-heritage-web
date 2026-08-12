"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { createComment, deleteComment } from "@/lib/actions/comment";
import type { CommentItem } from "@/lib/data/comment";
import { COMMENT_MAX } from "@/lib/profile";

/**
 * 착용샷 댓글 (D-178).
 *
 * ## ⚠️ 비로그인에게도 목록을 보여준다
 * 댓글은 착용샷의 일부다 — 숨기면 대화가 있는지조차 모른다. **입력만** 막고
 * 로그인 경로를 준다 (D-069 의 태도).
 *
 * ## ⚠️ 낙관적 추가를 하지 않는다
 * 팔로우 버튼(D-174)과 다르다. 댓글은 **본문·시각·삭제 권한**이 서버에서 정해지므로
 * 화면에서 미리 만들면 되돌릴 정보가 많다. 저장 후 새로고침으로 받는다.
 */
export function CommentSection({
  wearShotId,
  comments,
  loggedIn,
}: {
  wearShotId: string;
  comments: CommentItem[];
  loggedIn: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    setError("");
    startTransition(async () => {
      const res = await createComment({ wearShotId, body });
      if (!res.ok) {
        setError(res.fieldErrors.body ?? res.formError ?? t("error.generic"));
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <section className="border-t px-4 py-5 lg:px-0">
      <h2 className="text-base font-bold tracking-tight">
        {t("comment.title")}
        <span className="ml-2 text-sm font-semibold text-muted-foreground">
          {comments.length}
        </span>
      </h2>

      {comments.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("comment.empty")}</p>
      ) : (
        <ul className="mt-3 divide-y">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/rooms/${c.roomId}`}
                  className="text-sm font-semibold hover:underline"
                >
                  {c.roomName}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">
                  {c.createdAt}
                </span>
                {/* 줄바꿈을 살린다. 마크다운은 해석하지 않는다 (D-055 와 같은 기준) */}
                <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
              </div>
              {c.canDelete && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await deleteComment(c.id);
                      router.refresh();
                    })
                  }
                  className="shrink-0 text-xs text-muted-foreground underline disabled:opacity-40"
                >
                  {t("comment.delete")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {loggedIn ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="mt-4"
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={COMMENT_MAX}
            placeholder={t("comment.placeholder")}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {[...body].length} / {COMMENT_MAX}
            </span>
            <button
              type="submit"
              disabled={pending || !body.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {t("comment.submit")}
            </button>
          </div>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </form>
      ) : (
        <div className="mt-4 rounded-lg border bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">
            {t("comment.loginRequired")}
          </p>
          <Link
            href="/login"
            className="mt-3 inline-block rounded-lg border bg-background px-4 py-2 text-sm font-semibold hover:bg-accent"
          >
            {t("auth.login")}
          </Link>
        </div>
      )}
    </section>
  );
}
