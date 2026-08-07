import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * 방 검색 결과 행.
 *
 * **방 검색은 방 이름만 대상으로 한다** — 유저 소개 본문은 포함하지 않는다
 * (FR-04-A-06·07). 소개는 자유 서술이라 검색 노이즈가 크고, 프라이버시
 * 기대와도 어긋난다.
 */
export function RoomRow({
  id, name, level, itemCount,
}: {
  id: string; name: string; level: number; itemCount: number;
}) {
  const t = useTranslations();

  return (
    <Link
      href={`/rooms/${id}`}
      className="flex items-center gap-3 border-b px-4 py-3 hover:bg-accent lg:px-3"
    >
      <div className="size-11 shrink-0 rounded-full bg-muted" />
      <div className="min-w-0 flex-1">
        {/* 방 이름은 유저가 쓴 것이라 번역하지 않는다 */}
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{name}</p>
          <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-xs font-bold">
            {t("myRoom.level", { level })}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("myRoom.itemCount", { count: itemCount })}
        </p>
      </div>
    </Link>
  );
}
