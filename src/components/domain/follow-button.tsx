"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { follow, unfollow } from "@/lib/actions/follow";
import { cn } from "@/lib/utils";

/**
 * 팔로우 버튼 (D-174).
 *
 * ## ⚠️ 비로그인에게도 보여준다
 * 숨기면 이 기능이 있다는 것을 모른다. 누르면 로그인으로 보낸다 — 탭을 회색
 * 처리하지 않고 안내를 띄우는 D-069 와 같은 태도다.
 *
 * ## ⚠️ 낙관적 갱신을 하되 실패하면 되돌린다
 * 팔로우는 즉시 반응해야 하는 동작이다. 다만 실패를 삼키면 **눌렀는데 안 된
 * 상태**가 남으므로, 실패 시 원래대로 돌리고 메시지를 낸다.
 */
export function FollowButton({
  roomId,
  initialFollowing,
  loggedIn,
}: {
  roomId: string;
  initialFollowing: boolean;
  loggedIn: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function toggle() {
    if (!loggedIn) {
      // 로그인 후 돌아올 곳을 남긴다 (FR-05-B-02)
      router.push("/login");
      return;
    }
    const next = !following;
    setFollowing(next); // 낙관적
    setError("");
    startTransition(async () => {
      const res = next ? await follow(roomId) : await unfollow(roomId);
      if (!res.ok) {
        setFollowing(!next); // 되돌린다
        setError(res.formError ?? t("error.generic"));
      }
    });
  }

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={following}
        className={cn(
          "rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40",
          following
            ? "border text-muted-foreground hover:bg-accent"
            : "bg-primary text-primary-foreground hover:opacity-90",
        )}
      >
        {following ? t("follow.following") : t("follow.follow")}
      </button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
