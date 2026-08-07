import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ItemGrid } from "@/components/domain/item-grid";
import { DEV_ROOM_SECTIONS } from "@/lib/dev-fixture";
import { formatNumber } from "@/lib/format";

/**
 * S-23 카테고리 전체 (본인 방) — 진열 섹션의 "더 보기" 진입점 (D-085).
 *
 * 섹션당 노출 상한(~1023px 12개 / 1024px~ 15개)을 넘는 아이템이 여기로 온다.
 * 여기서는 상한 없이 전량을 낸다. 정렬은 등록순 고정이고 유저가 바꿀 수
 * 없다 (D-070).
 *
 * 전량을 방 화면에 그대로 두면 아이템이 수백 개인 방에서 첫 카테고리만으로
 * 스크롤이 끝나 다른 카테고리가 보이지 않는다 — 원칙 2(부피)가 오히려 죽는다.
 */
export default async function MyRoomCategoryPage({
  params,
}: PageProps<"/[locale]/me/c/[category]">) {
  const { category } = await params;
  const t = await getTranslations();

  const section = DEV_ROOM_SECTIONS.find((s) => s.slug === category);
  if (!section) notFound();

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
        <ItemGrid items={[...section.items]} capped={false} />
      </div>
    </div>
  );
}
