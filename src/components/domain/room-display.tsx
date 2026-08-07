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
 */
export function RoomDisplay({
  sections,
  goneItems,
  /** "더 보기" 경로 접두 — 본인 `/me`, 타인 `/rooms/{id}` */
  basePath,
}: {
  sections: RoomSection[];
  goneItems: ItemThumbData[];
  basePath: string;
}) {
  return (
    <div className="lg:min-w-0">
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
    </div>
  );
}
