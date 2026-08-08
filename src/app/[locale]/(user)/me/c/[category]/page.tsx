import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ItemGrid } from "@/components/domain/item-grid";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { getRoomCategory } from "@/lib/data/room";
import { formatNumber } from "@/lib/format";

/**
 * S-23 카테고리 전체 (본인 방) — 진열 섹션의 "더 보기" 진입점 (D-085).
 * 여기서는 상한 없이 전량을 낸다. 정렬은 등록순 고정 (D-070).
 */
export default async function MyRoomCategoryPage({
  params,
}: PageProps<"/[locale]/me/c/[category]">) {
  const { locale, category } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  if (!viewer) {
    redirect({ href: "/login", locale });
    return null;
  }

  const found = viewer.roomId
    ? await getRoomCategory(viewer.roomId, category, viewer)
    : null;
  if (!found) notFound();
  const { section } = found;

  return (
    <div>
      <header className="border-b px-4 py-4 lg:px-0">
        <h1 className="flex items-baseline gap-2 text-lg font-bold tracking-tight">
          {t(section.categoryKey)}
          <span className="text-sm font-semibold text-muted-foreground">
            {formatNumber(section.items.length)}
          </span>
        </h1>
      </header>
      <div className="px-4 py-5 lg:px-0">
        <ItemGrid items={section.items} capped={false} />
      </div>
    </div>
  );
}
