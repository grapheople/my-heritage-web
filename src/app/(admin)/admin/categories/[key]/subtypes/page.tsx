import { SubtypeManager } from "@/components/admin/subtype-manager";
import { categoryLabelKo } from "@/lib/category-label";
import { getAdminSubtypes } from "@/lib/data/admin";

/**
 * 카테고리 상세 — 하위 종류 (D-207 · D-246).
 *
 * ⚠️ **없는 것이 기본이다.** 제품군을 만들지 않으면 등록 폼은 지금과 같다 —
 * 캠핑처럼 속성 집합이 갈리는 카테고리에서만 만든다.
 *
 * ⚠️ **도감은 subtype 을 갖지 않는다** (D-207 결정 5). 도감 유일성을 subtype
 * 으로 쪼개면 같은 제품이 subtype 지정에 따라 두 도감으로 갈린다.
 */
export default async function CategorySubtypesPage({
  params,
}: PageProps<"/admin/categories/[key]/subtypes">) {
  const { key } = await params;
  const [all, label] = await Promise.all([getAdminSubtypes(), categoryLabelKo(key)]);
  const mine = all.filter((s) => s.categoryKey === key);

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        속성 집합이 서로 다른 제품군을 가릅니다 (D-207). 만들지 않으면 등록 폼은 지금과
        같습니다. 도감은 제품군으로 갈리지 않습니다.
      </p>
      <SubtypeManager categoryKey={key} categoryLabel={label} subtypes={mine} />
    </>
  );
}
