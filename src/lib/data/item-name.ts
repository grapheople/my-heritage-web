/**
 * 아이템 명칭은 **저장하지 않는 파생값이다** (D-073, M-14, FR-06-A-11).
 *
 * | 도감 | 명칭 |
 * |---|---|
 * | 연결됨 | `CodexItem.displayName` — 전 언어 공통 원문 1개 (D-009) |
 * | 미연결 | `brand.name + model` |
 *
 * ⚠️ **컬럼으로 저장하면 안 되는 이유**: 도감이 나중에 연결되거나(자동 생성·
 * 병합) 브랜드 alias 가 정리되면 명칭이 바뀌어야 하는데, 저장해두면 그 시점의
 * 값으로 굳는다. 병합(D-016) 후 옛 명칭이 남는 것이 대표적이다.
 *
 * 도감 명칭은 **번역하지 않는다** (D-009) — 그래서 locale 인자가 없다.
 */
export type NameSource = {
  codexItem: { displayName: string } | null;
  brand: { name: string } | null;
  model: string | null;
};

export function deriveItemName(item: NameSource): string {
  if (item.codexItem) return item.codexItem.displayName;
  const parts = [item.brand?.name, item.model].filter(
    (v): v is string => Boolean(v && v.trim()),
  );
  // 브랜드 요청 대기 중이면 brandId 가 null 일 수 있다 (D-046). 모델만으로 낸다
  return parts.join(" ");
}

/** 조회 시 위 파생에 필요한 최소 select — 화면마다 다시 쓰지 않게 모아둔다 */
export const NAME_SELECT = {
  model: true,
  // 별칭은 명칭과 늘 함께 쓰인다 (D-112) — 여기 두면 화면마다 빠뜨리지 않는다
  nickname: true,
  brand: { select: { name: true } },
  codexItem: { select: { displayName: true } },
} as const;
