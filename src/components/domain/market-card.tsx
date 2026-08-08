import Image from "next/image";
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
/**
 * id 에서 결정적 색상.
 *
 * **사진이 없을 때만** 쓴다. 아이템은 사진 1장이 필수라(FR-07-A-03) 정상
 * 데이터에서는 나오지 않는다 — 스토리지 전 옛 데이터의 안전망이다.
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
          {listing.photoUrl ? (
            <Image
              src={listing.photoUrl}
              alt=""
              fill
              sizes="(min-width:1024px) 25vw, 50vw"
              className="object-cover transition-transform group-hover:scale-[1.03]"
            />
          ) : (
            <div
              aria-hidden
              className="absolute inset-0 transition-transform group-hover:scale-[1.03]"
              style={{ background: swatch(listing.id) }}
            />
          )}
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
