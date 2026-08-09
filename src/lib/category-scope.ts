import { cookies } from "next/headers";
import { getViewer } from "@/lib/auth/viewer";
import { preferredCategoryKeys } from "@/lib/data/settings";
import { prisma } from "@/lib/prisma";

/**
 * **선택된 카테고리** — 서비스를 관통하는 축 (D-137).
 *
 * ## ⚠️ 카테고리는 더 이상 "필터"가 아니다
 * 예전에는 기본값이 `전체`이고 카테고리는 좁히는 수단이었다 (D-082). 이제는
 * **항상 하나가 선택돼 있고** NEW·검색·마켓이 그 안에서만 동작한다. 시계
 * 컬렉터가 캠핑 텐트를 스쳐 지나가지 않게 하는 것이 목적이다.
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

export type ResolvedCategory = {
  /** 지금 적용할 카테고리 key */
  key: string;
  /**
   * 유저가 **고른 적이 있는가**. `false` 면 첫 방문이라 선택 화면을 띄운다.
   *
   * ⚠️ **`false` 여도 콘텐츠는 렌더한다** — 아래 주석 참조
   */
  chosen: boolean;
  /** 화면이 그릴 선택지 */
  keys: string[];
};

/**
 * 지금 볼 카테고리를 정한다.
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
  const keys = await activeCategoryKeys();
  const valid = (k?: string) => (k && keys.includes(k) ? k : undefined);

  const url = valid(fromUrl);
  if (url) return { key: url, chosen: true, keys };

  const jar = await cookies();
  const cookie = valid(jar.get(CATEGORY_COOKIE)?.value);
  if (cookie) return { key: cookie, chosen: true, keys };

  const viewer = await getViewer();
  if (viewer) {
    const preferred = await preferredCategoryKeys(viewer.userId);
    const first = valid(preferred[0]);
    // 가입 때 고른 것이므로 **고른 것으로 친다** — 다시 묻지 않는다
    if (first) return { key: first, chosen: true, keys };
  }

  return { key: keys[0] ?? "watch", chosen: false, keys };
}
