import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatPrice } from "@/lib/format";
import type { MarketListing } from "@/lib/data/types";

/**
 * 매물 카드 (FR-02-A-04) — 이미지·명칭·가격·통화·카테고리·판매자 방 이름.
 *
 * ⚠️ **가격은 판매자 지정 통화 그대로 표시하고 환산하지 않는다** (D-011,
 * FR-02-A-05). 통화는 가격의 일부다.
 * **가격 변경 이력·인하 표식을 노출하지 않는다** (D-063, FR-03-A-11).
 */
function swatch(id: string): string {
  let n = 2166136261;
  for (const ch of id) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  const h = Math.abs(n) % 360;
  return `linear-gradient(140deg, hsl(${h} 42% 34%), hsl(${(h + 38) % 360} 52% 62%))`;
}

export function MarketCard({ listing }: { listing: MarketListing }) {
  const t = useTranslations();

  return (
    <article className="group">
      <Link href={`/items/${listing.id}`} className="block">
        <div className="relative aspect-square overflow-hidden rounded-md border bg-muted">
          <div
            aria-hidden
            className="absolute inset-0 transition-transform group-hover:scale-[1.03]"
            style={{ background: swatch(listing.id) }}
          />
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-snug font-semibold">
          {listing.name}
        </p>
        <p className="mt-1 text-base font-bold tracking-tight">
          {formatPrice(listing.price, listing.currency)}
        </p>
      </Link>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t(listing.categoryKey)}
      </p>
      <Link
        href={`/rooms/${listing.roomId}`}
        className="mt-0.5 block truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        {listing.roomName}
      </Link>
    </article>
  );
}
