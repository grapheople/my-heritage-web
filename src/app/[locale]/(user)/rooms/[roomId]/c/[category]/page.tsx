import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ItemGrid } from "@/components/domain/item-grid";
import { getViewer } from "@/lib/auth/viewer";
import { getRoomCategory } from "@/lib/data/room";
import { formatNumber } from "@/lib/format";

/**
 * S-23 카테고리 전체 (타인 방) — D-085.
 *
 * ⚠️ 비공개 아이템은 **여기서도 응답에서 제외한다** (D-083, FR-01-B-06).
 * S-03에서 걸렀다고 이 경로에서 새면 의미가 없다 — 직접 URL로 진입 가능하다.
 */
export default async function OtherRoomCategoryPage({
  params,
}: PageProps<"/[locale]/rooms/[roomId]/c/[category]">) {
  const { roomId, category } = await params;
  const t = await getTranslations();

  const found = await getRoomCategory(roomId, category, await getViewer());
  if (!found) notFound();

  // ⚠️ 비공개 아이템은 **조회에서** 빠져 있다. S-03 에서 걸렀다고 이 경로가
  // 새면 의미가 없다 — 직접 URL 진입이 가능하다 (D-083, FR-01-B-06)
  const { room, section } = found;
  const items = section.items;

  return (
    <div>
      <header className="border-b px-4 py-4 lg:px-0">
        <p className="text-xs text-muted-foreground">{room.name}</p>
        <h1 className="flex items-baseline gap-2 text-lg font-bold tracking-tight">
          {t(section.categoryKey)}
          <span className="text-sm font-semibold text-muted-foreground">
            {formatNumber(items.length)}
          </span>
        </h1>
      </header>
      <div className="px-4 py-5 lg:px-0">
        <ItemGrid items={items} capped={false} />
      </div>
    </div>
  );
}
