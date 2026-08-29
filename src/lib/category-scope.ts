import { cookies } from "next/headers";
import { getViewer } from "@/lib/auth/viewer";
import { preferredCategoryKeys } from "@/lib/data/settings";
import { prisma } from "@/lib/prisma";

/**
 * **카테고리 축** — 서비스를 관통하는 축 (D-137).
 *
 * ## ⚠️ 카테고리는 "필터"가 아니다
 * 예전에는 기본값이 `전체`이고 카테고리는 좁히는 수단이었다 (D-082). 지금은
 * 축이다 — 시계 컬렉터가 캠핑 텐트를 스쳐 지나가지 않게 하는 것이 목적이다.
 *
 * ## 이 파일에 함수가 **둘** 있다 (D-271)
 * | 함수 | 쓰는 곳 | 단위 |
 * |---|---|---|
 * | `myCategoryKeys()` | 홈 · 마켓 · 아이템 등록 | **내 관심사 집합** |
 * | `resolveCategory()` | **도감뿐** | 선택된 1개 |
 *
 * ⚠️ **둘을 다른 파일로 나누지 않는다.** 축의 규칙이 흩어지면 조용히 갈린다 —
 * D-190·D-197·D-270 이 전부 같은 모양의 실패다.
 *
 * **내 방은 제외한다** — 자기 물건은 카테고리를 넘나들며 본다. 방이 곧
 * 컬렉션 전체라는 D-068·D-089 의 전제가 거기서는 그대로다.
 *
 * ## 우선순위
 * | 순위 | 출처 | 왜 |
 * |:--:|---|---|
 * | 1 | URL `?category=` | 공유된 링크가 이긴다. 남이 보낸 링크를 내 쿠키가 덮으면 안 된다 |
 * | 2 | 쿠키 | **비로그인도 유지된다.** 관람자 유입을 막지 않는다는 D-069 의 취지 |
 * | 3 | 선호 카테고리 첫 항목 | 가입 때 고른 것 (D-124) |
 * | 4 | 첫 활성 카테고리 | 아무 이력이 없는 첫 방문 — 이때만 선택 화면을 띄운다 |
 */
export const CATEGORY_COOKIE = "MYHERITAGE_CATEGORY";

export type CategoryOption = { key: string; label: string };

/** 활성 카테고리 — 표시 순서대로 */
export async function activeCategoryKeys(): Promise<string[]> {
  const rows = await prisma.category.findMany({
    where: { active: true },
    orderBy: { displayOrder: "asc" },
    select: { key: true },
  });
  return rows.map((r) => r.key);
}

/**
 * **내 관심 카테고리 집합** — 홈·검색·마켓·아이템 등록이 쓰는 축 (D-271).
 *
 * ## ⚠️ D-137 을 없애는 것이 아니라 **단위를 바꾼다**
 * 카테고리는 여전히 서비스를 관통하는 축이다. 다만 "선택된 1개" 가 아니라
 * **"내가 모으는 것들"** 이다. D-137 의 목적 — 시계 컬렉터가 캠핑 텐트를 스쳐
 * 지나가지 않게 — 는 관심사로 걸러도 성립하고, 시계와 캠핑을 함께 모으는
 * 사람은 이제 둘 다 본다.
 *
 * **도감은 여전히 하나를 고른다** (`resolveCategory`). 제품 사전을 훑는
 * 화면이라 한 카테고리 안에서 깊이 보는 것이 맞다 — 시계 레퍼런스를 찾는
 * 중에 텐트가 섞이면 목록이 못 쓰게 된다.
 *
 * ## ⚠️ **절대 빈 배열을 내지 않는다**
 * 관심사가 없다고 화면을 비우면 둘이 동시에 깨진다:
 * - **D-069** — 관람자가 콘텐츠 대신 벽을 만난다
 * - **D-109** — 크롤러가 받는 HTML 에 아이템이 하나도 없다. `Zroom` 으로
 *   검색해도 서비스가 안 나오던 상태로 되돌아간다
 *
 * 호출부가 `[]` 를 "아무것도 안 보여준다" 로 해석할 여지를 남기지 않는다.
 *
 * | 상황 | 결과 |
 * |---|---|
 * | 로그인 + 관심사 있음 | 그 집합 |
 * | 로그인 + 관심사 없음 | **전체** |
 * | 비로그인 | **전체** |
 */
export async function myCategoryKeys(): Promise<string[]> {
  const all = await activeCategoryKeys();
  const viewer = await getViewer();
  if (!viewer) return all;

  const preferred = await preferredCategoryKeys(viewer.userId);
  // 비활성 카테고리가 관심사에 남아 있을 수 있다 (D-036 — 지우지 않는다)
  const usable = preferred.filter((k) => all.includes(k));
  return usable.length > 0 ? usable : all;
}

export type ResolvedCategory = {
  /** 지금 적용할 카테고리 key */
  key: string;
  /**
   * 유저가 **고른 적이 있는가**. `false` 면 첫 방문이라 선택 화면을 띄운다.
   *
   * ⚠️ **`false` 여도 콘텐츠는 렌더한다** — 아래 주석 참조
   */
  chosen: boolean;
  /**
   * 화면이 그릴 선택지 — **내 관심사로 좁혀진 목록** (D-273).
   *
   * ⚠️ `key` 는 이 목록 밖일 수 있다. 관심사에 없는 카테고리의 공유 링크를
   * 열었을 때다 — 그때는 그 카테고리를 목록에 **끼워 넣는다.** 빼면 셀렉트가
   * 값 없이 비어 보이고, 유저는 자기가 무엇을 보고 있는지 알 수 없다
   */
  keys: string[];
};

/**
 * 지금 볼 카테고리를 정한다 — **도감 전용** (D-272).
 *
 * ## ⚠️ 판정은 전체로, 선택지는 관심사로 (D-273)
 * **유효성은 활성 카테고리 전부**를 기준으로 본다. 관심사로 판정하면 남이
 * 보낸 `?category=bicycle` 링크가 내 관심사에 없다는 이유로 조용히 다른
 * 카테고리로 떨어진다 — 공유 링크가 이긴다는 이 함수의 1순위가 깨진다.
 *
 * **고를 수 있는 목록만** 관심사로 좁힌다.
 *
 * ## ⚠️ 고른 적이 없어도 **콘텐츠를 비우지 않는다**
 * 선택 화면만 내보내면 두 가지가 깨진다:
 * - **D-109 홈 전체 색인** — 크롤러가 받는 HTML 에 아이템이 하나도 없다.
 *   `Zroom` 으로 검색해도 서비스가 안 나오던 상태로 되돌아간다
 * - **D-069 진입 즉시 콘텐츠** — 관람자가 벽부터 만난다
 *
 * 그래서 **기본 카테고리 콘텐츠를 서버에서 렌더하고, 그 위에 선택 화면을
 * 덮는다.** 크롤러는 덮개를 무시하고 콘텐츠를 읽는다.
 */
export async function resolveCategory(
  fromUrl?: string,
): Promise<ResolvedCategory> {
  const all = await activeCategoryKeys();
  // 고를 수 있는 목록은 관심사로 좁힌다 — 판정은 아래에서 `all` 로 한다
  const mine = await myCategoryKeys();
  const valid = (k?: string) => (k && all.includes(k) ? k : undefined);
  /* 관심사 밖 카테고리를 보고 있으면 목록에 끼워 넣는다 — 안 그러면 셀렉트가
     빈 값으로 보인다 */
  const done = (key: string, chosen: boolean): ResolvedCategory => ({
    key,
    chosen,
    keys: mine.includes(key) ? mine : [key, ...mine],
  });

  const url = valid(fromUrl);
  if (url) return done(url, true);

  const jar = await cookies();
  const cookie = valid(jar.get(CATEGORY_COOKIE)?.value);
  if (cookie) return done(cookie, true);

  const viewer = await getViewer();
  if (viewer) {
    const preferred = await preferredCategoryKeys(viewer.userId);
    const first = valid(preferred[0]);
    // 가입 때 고른 것이므로 **고른 것으로 친다** — 다시 묻지 않는다
    if (first) return done(first, true);
  }

  /* 아무 이력이 없는 첫 방문. `mine` 은 비어 오지 않으므로 `?? "watch"` 는
     카테고리가 하나도 활성이 아닌 경우의 마지막 방어다 */
  return done(mine[0] ?? all[0] ?? "watch", false);
}
