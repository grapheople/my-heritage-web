import Image from "next/image";
import { useTranslations } from "next-intl";

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
 */
export function RoomProfile({
  roomName,
  bio,
  level,
  itemCount,
  imageUrl,
}: {
  roomName: string;
  bio?: string;
  level: number;
  itemCount: number;
  /** 방 대표 사진. 없으면 빈 자리 (D-130) */
  imageUrl?: string;
}) {
  const t = useTranslations();

  return (
    <header className="border-b bg-card px-4 py-5 lg:col-span-2 lg:border-0 lg:px-0">
      <div className="flex items-center gap-4">
        <span className="relative size-15 shrink-0 overflow-hidden rounded-full bg-muted">
          {imageUrl && (
            /* 저장본이 정방형이라(D-129) 원형 마스크에 그대로 맞는다 */
            <Image src={imageUrl} alt="" fill sizes="60px" className="object-cover" />
          )}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-bold tracking-tight">
              {roomName}
            </h1>
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold">
              {t("myRoom.level", { level })}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("myRoom.itemCount", { count: itemCount })}
          </p>
        </div>
      </div>
      {bio && <p className="mt-3 text-sm text-muted-foreground">{bio}</p>}
    </header>
  );
}
