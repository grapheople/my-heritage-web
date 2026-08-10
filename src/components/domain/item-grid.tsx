import { ItemThumb, type ItemThumbData } from "./item-thumb";

/**
 * 진열 그리드 — **3열 고정** (D-156, D-089 를 되돌림).
 *
 * | 폭 | 열 | 섹션당 노출 (D-085) |
 * |---|---|---|
 * | 전 구간 | 3 | 12 (3×4) |
 *
 * ## ⚠️ 반응형 3/4/5열을 없앴다 (D-156)
 * 콘텐츠 폭이 **500px 로 고정**되어 어느 폭에서도 열을 늘릴 자리가 없다.
 * D-089 는 데스크톱에서 5열로 넓혀 원칙 2("부피가 느껴진다")를 살리려 했고,
 * D-144 는 그 위에 `lg:gap-5` 로 갤러리 리듬을 얹었다 — 둘 다 500px 캡과
 * 양립하지 않는다. **부피감을 폭에서 얻지 못하게 되었다**는 것이 이 결정의
 * 비용이다 (OI-73 과 같은 방향의 양보).
 *
 * ## 간격 — 갤러리형 (D-144)
 * `gap-3`. 타일을 밀착시키면 사진 경계가 흐릿할 때 답답해 보이고,
 * **사진 하나하나가 "물건"으로 읽히지 않는다.** 여백이 그 역할을 한다.
 * `lg:gap-5` 는 제거했다 — 500px 에서 간격을 더 벌리면 타일이 작아진다.
 *
 * ## ⚠️ 상한을 12 로 통일했다 (D-156)
 * 옛 `lg: 15` 는 **5열×3행**이라 나온 수다. 3열 고정에서 15 를 유지하면
 * 데스크톱에서만 5행이 되어 "PC 에서 늘어나지 않는다"와 어긋난다.
 * 12 = **3열×4행**으로 마지막 줄이 비지 않는다.
 *
 * 감추는 방식은 그대로 CSS 다 — `lib/data/room.ts` 는 섹션 아이템에 `take` 를
 * 걸지 않고 전부 내려보낸다. 상한이 폭에 따라 갈리지 않게 된 지금은 서버에서
 * 자르는 편이 낫지만, **그건 이 결정의 범위가 아니다** (지금도 동작은 같다).
 */
export const DISPLAY_CAP = 12;

/**
 * 순번별 노출 규칙 (FR-01-A-16).
 * - 0~11 : 보인다
 * - 12~  : 숨긴다. "더 보기"로 S-23 에서 본다
 */
function capClass(i: number): string | undefined {
  return i >= DISPLAY_CAP ? "hidden" : undefined;
}

export function ItemGrid({
  items,
  parted = false,
  /** 섹션 상한을 적용할지. 카테고리 전체 화면(S-23)에서는 false */
  capped = true,
}: {
  items: ItemThumbData[];
  parted?: boolean;
  capped?: boolean;
}) {
  return (
    <ul className="grid grid-cols-3 gap-3">
      {items.map((item, i) => (
        <li key={item.id} className={capped ? capClass(i) : undefined}>
          <ItemThumb item={item} parted={parted} />
        </li>
      ))}
    </ul>
  );
}
