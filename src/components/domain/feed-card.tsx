import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "./status-badge";

/**
 * NEW 피드 카드 (FR-03-A-05).
 *
 * ⚠️ **진열 카드(`ItemThumb`)와 표시 항목이 다르다.** 피드에는 카테고리와
 * 소유자 방 이름이 들어가고, 진열 카드에는 넣지 않는다 (D-074) — 진열은
 * 섹션 헤더에 카테고리가 이미 있고 방은 자기 방이라 자명하기 때문이다.
 *
 * 아이템 명칭·방 이름은 **번역하지 않는다** (FR-03-A-12, 원칙 5).
 */
export type FeedItem = {
  id: string;
  name: string;
  categoryKey: string;
  roomId: string;
  roomName: string;
  onSale?: boolean;
};

/** id에서 결정적 색상 — 스토리지가 붙기 전(OI-47) 개발용 경로 */
function swatch(id: string): string {
  let n = 2166136261;
  for (const ch of id) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  const h = Math.abs(n) % 360;
  return `linear-gradient(140deg, hsl(${h} 42% 34%), hsl(${(h + 38) % 360} 52% 62%))`;
}

export function FeedCard({ item }: { item: FeedItem }) {
  const t = useTranslations();

  return (
    <article className="group">
      <Link href={`/items/${item.id}`} className="block">
        <div className="relative aspect-square overflow-hidden rounded-md border bg-muted">
          <div
            aria-hidden
            className="absolute inset-0 transition-transform group-hover:scale-[1.03]"
            style={{ background: swatch(item.id) }}
          />
          {item.onSale && (
            <div className="absolute top-1.5 left-1.5">
              <StatusBadge variant="sale" />
            </div>
          )}
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-snug font-semibold">
          {item.name}
        </p>
      </Link>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t(item.categoryKey)}
      </p>
      {/* 방으로 가는 링크가 피드의 핵심 동선이다 — "남의 방 들여다보기" */}
      <Link
        href={`/rooms/${item.roomId}`}
        className="mt-1 block truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        {item.roomName}
      </Link>
    </article>
  );
}
