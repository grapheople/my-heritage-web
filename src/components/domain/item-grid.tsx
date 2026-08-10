import { ItemThumb, type ItemThumbData } from "./item-thumb";

/**
 * 진열 그리드 — 반응형 3/4/5열 (D-089).
 *
 * | 폭 | 열 | 섹션당 노출 (D-085) |
 * |---|---|---|
 * | ~639px  | 3 | 12 (3×4) |
 * | 640~1023px | 4 | 12 (4×3) |
 * | 1024px~ | 5 | 15 (5×3) |
 *
 * 노출 수를 **열 수의 정수배**로 잡아 마지막 줄이 비지 않게 한다.
 *
 * ## 간격 — 갤러리형 (D-144)
 * `gap-3 lg:gap-5`. 타일을 밀착시키면 사진 경계가 흐릿할 때 답답해 보이고,
 * **사진 하나하나가 "물건"으로 읽히지 않는다.** 여백이 그 역할을 한다.
 *
 * ⚠️ **열 수는 D-089 그대로(3/4/5)다.** 줄이면 타일이 커져 갤러리형에 더
 * 가깝지만, 한 화면에 보이는 개수가 줄어 **원칙 2(부피가 느껴진다)와 상충**한다
 * — 별도 결정이 필요하다.
 *
 * ⚠️ 상한이 브레이크포인트마다 다르므로 서버에서 **최대치(15)를 내려보내고
 * 초과분만 CSS로 감춘다.** JS로 폭을 재서 자르면 SSR/CSR 결과가 어긋난다
 * (10-frontend-spec.md §7).
 */
export const DISPLAY_CAP = { smMd: 12, lg: 15 } as const;

/**
 * 순번별 노출 규칙 (FR-01-A-16).
 * - 0~11   : 항상 보인다
 * - 12~14  : `lg`에서만 (sm·md 상한 12)
 * - 15~    : 항상 숨긴다 (lg 상한 15). "더 보기"로 S-23에서 본다
 */
function capClass(i: number): string | undefined {
  if (i >= DISPLAY_CAP.lg) return "hidden";
  if (i >= DISPLAY_CAP.smMd) return "hidden lg:block";
  return undefined;
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
    <ul className="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-5">
      {items.map((item, i) => (
        <li key={item.id} className={capped ? capClass(i) : undefined}>
          <ItemThumb item={item} parted={parted} />
        </li>
      ))}
    </ul>
  );
}
