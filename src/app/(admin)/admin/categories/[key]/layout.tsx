import { notFound } from "next/navigation";
import { CategoryTabs } from "@/components/admin/category-tabs";
import { categoryLabelKo } from "@/lib/category-label";
import { getAdminCategoryDetail } from "@/lib/data/admin";

/**
 * 카테고리 상세 공통 레이아웃 (D-246).
 *
 * ⚠️ **존재 검증은 여기 한 곳에서만 한다.** 탭마다 걸면 새 탭을 추가할 때
 * 빠뜨린다 — 어드민 인가 가드가 layout 에 있는 것과 같은 이유다 (D-096).
 *
 * ⚠️ **DB 로 판정한다.** `adminCategoryOptions()` 로 하면 카테고리 추가
 * 스크립트 직후 **있는 카테고리가 404 가 된다** (OI-82).
 */
export default async function CategoryDetailLayout({
  children,
  params,
}: LayoutProps<"/admin/categories/[key]">) {
  const { key } = await params;
  const detail = await getAdminCategoryDetail(key);
  if (!detail) notFound();

  const label = await categoryLabelKo(key);

  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="border-b pb-4">
        <p className="text-xs font-semibold text-muted-foreground">A-01 · 카테고리 상세</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{label}</h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{key}</p>
        <CategoryTabs slug={key} />
      </header>
      <div className="mt-6">{children}</div>
    </div>
  );
}
