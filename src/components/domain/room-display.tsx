import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "./empty-state";
import { GoneSection } from "./gone-section";
import type { ItemThumbData } from "./item-thumb";
import { Section } from "./section";

export type RoomSection = {
  /** i18n key — `category.watch` 등 */
  categoryKey: string;
  slug: string;
  items: ItemThumbData[];
};

/**
 * 방 진열 본문 — S-02(본인)·S-03(타인) 공유.
 *
 * 뷰어 분기는 **호출부에서 데이터를 걸러 넘기는 것으로** 처리한다.
 * 이 컴포넌트는 받은 것을 그대로 낸다.
 *
 * ⚠️ 타인 방에서 권한 없는 아이템은 **응답 자체에서 빠져야 한다** (D-083,
 * FR-01-B-06). 여기서 숨기는 방식이면 HTML에 남는다.
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 카테고리별 세로 스크롤 섹션 | D-068, FR-01-A-01 |
 * | 섹션 순서 = 개수 내림차순 (호출부 책임) | D-075, FR-01-A-10 |
 * | 아이템 0건 카테고리는 숨김 | FR-01-A-04 |
 * | 떠난 아이템은 맨 아래·기본 접힘·0건이면 숨김 | D-023·D-086, FR-01-A-08·09·13 |
 * | **추억함 진입은 맨 아래 한 줄·0건이면 숨김** | D-296 |
 * | **본인 방이 비면 첫 등록을 유도** | D-133, 핸드오프 S-02 |
 *
 * ## ⚠️ 등록 진입점은 여기밖에 없었다
 * `/items/new` 페이지는 있는데 **링크가 0곳**이었다 — 화면으로는 아이템을
 * 등록할 방법이 없었다. 진열이 비어 있을 때 유도하는 것만으로는 부족하다.
 * 이미 물건이 있는 유저도 계속 추가하므로 **상시 버튼**이 필요하다.
 */
export function RoomDisplay({
  sections,
  goneItems,
  archivedCount = 0,
  /** "더 보기" 경로 접두 — 본인 `/me`, 타인 `/rooms/{id}` */
  basePath,
  owner = false,
}: {
  sections: RoomSection[];
  goneItems: ItemThumbData[];
  /**
   * 추억함에 보관된 아이템 수 (D-296) — **뷰어 기준**으로 이미 걸러져 온다.
   *
   * ⚠️ 0 이면 진입 자체를 그리지 않는다. 타인 방에서 빈 추억함으로 들어가면
   * "숨긴 것이 있나" 를 묻게 되는데, 그것이 곧 D-083 이 감추려는 정보다.
   */
  archivedCount?: number;
  basePath: string;
  /** 본인 방인가 — 등록 진입점은 본인에게만 (핸드오프 S-03 "등록·수정 버튼이 없습니다") */
  owner?: boolean;
}) {
  const t = useTranslations();
  const hasItems = sections.some((s) => s.items.length > 0);

  // 아이템도 떠난 것도 추억함도 없는 본인 방 — 첫 등록을 유도한다
  if (owner && !hasItems && goneItems.length === 0 && archivedCount === 0) {
    return (
      <div className="lg:min-w-0">
        <EmptyState
          title={t("myRoom.emptyRoomTitle")}
          description={t("myRoom.emptyRoomDesc")}
          action={
            <Link
              href="/items/new"
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              {t("myRoom.addFirstItem")}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="lg:min-w-0">
      {owner && (
        <div className="flex justify-end px-4 pt-4 lg:px-0">
          <Link
            href="/items/new"
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground"
          >
            + {t("myRoom.addItem")}
          </Link>
        </div>
      )}
      {sections
        .filter((s) => s.items.length > 0)
        .map((s) => (
          <Section
            key={s.slug}
            categoryKey={s.categoryKey}
            totalCount={s.items.length}
            items={s.items}
            moreHref={`${basePath}/c/${s.slug}`}
          />
        ))}

      {goneItems.length > 0 && <GoneSection items={goneItems} />}

      {/*
        추억함 (S-28, D-296) — 진열 맨 아래 한 줄. 떠난 아이템 **아래**다:
        떠난 것은 이 방의 이력이고 추억함은 **다른 화면**이다
      */}
      {archivedCount > 0 && (
        <Link
          href={`${basePath}/archive`}
          className="flex items-center justify-between border-t px-4 py-4 text-sm font-semibold hover:bg-accent lg:px-0"
        >
          <span>{t("myRoom.archive")}</span>
          <span className="text-muted-foreground">{archivedCount}</span>
        </Link>
      )}
    </div>
  );
}
