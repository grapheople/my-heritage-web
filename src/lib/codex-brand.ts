import { normalizeBrandToken } from "@/lib/brand-search";

/**
 * 도감이 **어느 브랜드의 것인가**를 추정한다 (D-289).
 *
 * ## ⚠️ `CodexItem` 에는 브랜드 링크가 없다
 * 도감은 제품 원형이고 브랜드는 마스터인데 **둘을 잇는 컬럼이 없다.** 유저
 * 아이템을 거쳐야만 닿는다(`codex.items[0].brand`) — 보유자 0인 도감은 그마저
 * 없다. 그래서 **이름에서 추정한다.**
 *
 * ## 두 단계로 찾는다
 * | 순서 | 근거 | 되는 카테고리 |
 * |---|---|---|
 * | ① | 매칭 키 **첫 세그먼트** | `brand` 가 키에 있는 곳 — 캠핑·자전거·옷 |
 * | ② | **명칭 앞부분** | 시계처럼 키가 `uniqueId` 하나라 브랜드가 없는 곳 |
 *
 * ## ⚠️ 긴 이름이 이긴다
 * `Grand Seiko` 를 `Seiko` 로 잡으면 안 된다. 후보를 **토큰 길이 내림차순**으로
 * 훑는다.
 *
 * ## ⚠️ 후보는 **그 카테고리의 브랜드 전부**여야 한다
 * 일부만 후보로 두면 **긴 이름이 짧은 이름을 가려주지 못한다.** 실제로 겪었다
 * (D-285): 우선순위 있는 브랜드만 후보로 뒀더니 `Yeti Cycles ARC Frame`(자전거)
 * 가 `YETI`(캠핑)로 잡혔다. 카테고리를 넘나들며 맞추지도 않는다.
 *
 * ## ⚠️ 이 파일이 그 규칙의 **단일 출처**다
 * `prisma/apply-brand-priority.ts`(우선순위 복사)와 A-11 브랜드 목록(연결 도감
 * 수)이 **같은 함수**를 쓴다. 복사하면 한쪽만 고쳐져 조용히 갈린다 — 이 세션에서
 * D-190·D-197·D-270·D-275·D-282·D-283 으로 반복해 나온 실패다.
 */

/** 매칭 키 세그먼트 구분자 — `lib/codex-key.ts` 의 `SEP` 과 같아야 한다 */
const SEP = String.fromCharCode(31);

export type BrandRef = { name: string; token: string };
export type CodexRef = {
  normalizedKey: string;
  displayName: string;
  categoryKey: string;
};

/**
 * 카테고리별 브랜드 후보표를 만든다 — **긴 이름부터** 정렬해 둔다.
 *
 * @param scopes `BrandScope` 를 카테고리 키·브랜드명으로 펼친 것
 */
export function buildBrandIndex(
  scopes: { categoryKey: string; brandName: string }[],
): Map<string, BrandRef[]> {
  const index = new Map<string, BrandRef[]>();
  for (const s of scopes) {
    if (!index.has(s.categoryKey)) index.set(s.categoryKey, []);
    index
      .get(s.categoryKey)!
      .push({ name: s.brandName, token: normalizeBrandToken(s.brandName) });
  }
  // ⚠️ 긴 토큰이 먼저 — `Yeti Cycles` 가 `YETI` 를 가려야 한다
  for (const list of index.values()) list.sort((a, b) => b.token.length - a.token.length);
  return index;
}

/**
 * 도감 하나의 브랜드명을 추정한다. 못 찾으면 `null`.
 *
 * ⚠️ **`null` 은 실패가 아니라 정상적인 결과다** — 브랜드 마스터에 없는 이름으로
 * 만들어진 도감이 있을 수 있다.
 */
export function inferCodexBrand(
  codex: CodexRef,
  index: Map<string, BrandRef[]>,
): string | null {
  const candidates = index.get(codex.categoryKey) ?? [];
  if (candidates.length === 0) return null;

  // ① 매칭 키 첫 세그먼트
  const head = codex.normalizedKey.split(SEP)[0];
  const byKey = candidates.find((b) => b.token === head);
  if (byKey) return byKey.name;

  // ② 명칭 앞부분
  const norm = normalizeBrandToken(codex.displayName);
  return candidates.find((b) => norm.startsWith(b.token))?.name ?? null;
}

/** 브랜드명 → 도감 수. 추정하지 못한 도감은 세지 않는다 */
export function countCodexByBrand(
  codex: CodexRef[],
  index: Map<string, BrandRef[]>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of codex) {
    const name = inferCodexBrand(c, index);
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}
