import { CATEGORY_KEYS } from "@/lib/categories";
import { categoryLabelKo } from "@/lib/category-label";

/**
 * 어드민 필터용 카테고리 선택지 (D-030 — ko 단일).
 *
 * ## ⚠️ 라벨 맵을 화면마다 만들지 않는다
 * `{ watch: "시계", ... }` 같은 맵이 어드민 곳곳에 흩어져 있었고, **카테고리를
 * 추가할 때마다 한 곳씩 빠졌다** — 운동(D-163)을 넣었을 때 도감 화면 두 곳이
 * `workout` 을 그대로 렌더했고(D-185), A-01 은 빈칸이었으며(D-173), A-11 은
 * 모든 브랜드를 "시계"로 표시했다(D-182). **같은 버그를 세 번 만났다.**
 *
 * 키는 `CATEGORY_KEYS`(D-166 단일 출처), 라벨은 `messages/ko.json`.
 * 카테고리가 늘어도 고칠 곳이 없다.
 *
 * ⚠️ 여전히 코드 배열이다 — 근본은 DB 에서 읽는 것이고 그건 **OI-82** 다.
 */
export async function adminCategoryOptions(): Promise<{ key: string; label: string }[]> {
  return Promise.all(
    CATEGORY_KEYS.map(async (key) => ({ key, label: await categoryLabelKo(key) })),
  );
}
