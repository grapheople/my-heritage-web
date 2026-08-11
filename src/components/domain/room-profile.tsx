import { Settings } from "lucide-react";
import type { ReactNode } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * 방 프로필 헤더 — S-02(본인)·S-03(타인) 공유 (FR-01-C).
 *
 * 방 이름·소개는 **유저가 쓴 것이라 번역하지 않는다** (FR-01-C-02, 원칙 5).
 *
 * ⚠️ **사진이 없으면 회색 원이다.** 예전에는 `imageUrl` 을 받지도 않아
 * 사진을 올릴 수 있게 만든 뒤에도 **표시되는 곳이 0곳**이었다 (D-130).
 *
 * ⚠️ `itemCount`는 호출부가 뷰어 기준으로 계산해 넘긴다 — 타인 방에서는
 * **공개 아이템만** 센다 (FR-01-C-03). 떠난 아이템은 양쪽 모두 제외 (FR-01-A-07).
 *
 * ## ⚠️ 톱니바퀴는 **본인 방에서만** (D-158)
 * 이 컴포넌트는 S-02(본인)·S-03(타인)이 **공유한다.** `owner` 를 받지 않고
 * 항상 렌더하면 남의 방에 내 설정 링크가 뜬다 — 눌러도 내 설정이 열리므로
 * 권한 문제는 아니지만, **남의 방에서 내 것을 고치는 것처럼 보인다.**
 *
 * 프로필 설정 화면(`/me/settings`)은 처음부터 있었는데 **내 방에서 가는 링크가
 * 없었다** — D-133·D-157 과 같은 유형이다.
 */
export function RoomProfile({
  roomName,
  bio,
  level,
  itemCount,
  imageUrl,
  owner = false,
  /**
   * 팔로워·팔로잉 수와 목록 경로 (D-174).
   *
   * ⚠️ **조회 유저마다 다른 값이다** — 차단·비공개·탈퇴가 빠진다(E-07-07).
   * 호출부가 뷰어 기준으로 계산해 넘긴다.
   */
  follow,
  /** 팔로우 버튼 — 타인 방에서만. 서버에서 만들어 넘긴다 */
  followButton,
}: {
  roomName: string;
  bio?: string;
  level: number;
  itemCount: number;
  /** 방 대표 사진. 없으면 빈 자리 (D-130) */
  imageUrl?: string;
  /** 본인 방인가 — 톱니바퀴(프로필 설정)를 여기서만 낸다 (D-158) */
  owner?: boolean;
  follow?: { followers: number; following: number; basePath: string };
  followButton?: ReactNode;
}) {
  const t = useTranslations();

  return (
    <header className="border-b bg-card px-4 py-5">
      <div className="flex items-center gap-4">
        <span className="relative size-15 shrink-0 overflow-hidden rounded-full bg-muted">
          {imageUrl && (
            /* 저장본이 정방형이라(D-129) 원형 마스크에 그대로 맞는다 */
            <Image src={imageUrl} alt="" fill sizes="60px" className="object-cover" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-bold tracking-tight">
              {roomName}
            </h1>
            <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-bold">
              {t("myRoom.level", { level })}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("myRoom.itemCount", { count: itemCount })}
          </p>

          {/* 팔로워·팔로잉 (D-174). 숫자를 눌러 목록으로 — 흔한 관례를 따른다 */}
          {follow && (
            <p className="mt-1 flex flex-wrap gap-x-3 text-sm">
              <Link
                href={`${follow.basePath}/followers`}
                className="text-muted-foreground hover:underline"
              >
                <b className="text-foreground">{follow.followers}</b>{" "}
                {t("follow.followers")}
              </Link>
              <Link
                href={`${follow.basePath}/following`}
                className="text-muted-foreground hover:underline"
              >
                <b className="text-foreground">{follow.following}</b>{" "}
                {t("follow.followingCount")}
              </Link>
            </p>
          )}
        </div>

        {/* 팔로우 버튼 — 타인 방에서만 (D-174) */}
        {followButton}

        {/* 프로필 설정 (D-158). 아이콘만이라 `aria-label` 이 유일한 이름이다 */}
        {owner && (
          <Link
            href="/me/settings"
            aria-label={t("settings.title")}
            title={t("settings.title")}
            className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center self-start text-muted-foreground hover:text-foreground"
          >
            <Settings className="size-5" aria-hidden />
          </Link>
        )}
      </div>
      {bio && <p className="mt-3 text-sm text-muted-foreground">{bio}</p>}
    </header>
  );
}
