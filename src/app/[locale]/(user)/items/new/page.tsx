import { getTranslations } from "next-intl/server";
import { ItemForm } from "@/components/domain/item-form";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { viewerLangOrder } from "@/lib/language-scope";
import { getRoutineFieldLabels, photoRequiredByCategory } from "@/lib/data/item";
import { myCategoryKeys } from "@/lib/category-scope";

import type { Locale } from "@/i18n/routing";

/**
 * S-04 아이템 등록 (D-076).
 * 2단계 — ① 카테고리 ② 입력. 자동 채움은 ②의 상태 변화다 (FR-05-A-08·09).
 */
export default async function NewItemPage({
  params,
}: PageProps<"/[locale]/items/new">) {
  const { locale } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  if (!viewer) {
    redirect({ href: { pathname: "/login", query: { next: "/items/new" } }, locale });
    return null;
  }

  /*
    D-236 — 루틴 구성 편집기의 라벨·단위. **운동 카테고리를 고를 때만 쓰이지만
    여기서 미리 읽는다** — 카테고리 선택 후 다시 불러오려면 라우트 핸들러가 하나
    더 필요하고, 7개 라벨이라 비용이 없다.

    ⚠️ 라벨은 **DB 에서** 온다 (D-135) — 메시지 파일에 박으면 어드민이 A-02 에서
    이름을 바꿨을 때 이 폼만 옛 이름으로 남는다
  */
  const routineFieldLabels = await getRoutineFieldLabels(locale as Locale);
  /*
    D-245 — 카테고리별 사진 필수 여부. **루틴은 사진이 필수가 아니다**(D-224)
    인데 폼의 검증이 무조건이어서 사진 없이 등록할 수 없었다.
    ⚠️ 라벨과 같은 이유로 **여기서 미리 읽는다** — 카테고리 선택 후 다시
    불러오려면 라우트 핸들러가 하나 더 필요하고, 7개 boolean 이라 비용이 없다
  */
  const photoRequired = await photoRequiredByCategory();
  /*
    D-271 — 1단계 선택지는 **내 관심 카테고리**다. 전체 8개를 깔면 등록할
    생각이 없는 카테고리가 절반을 차지한다. 관심사가 없으면 전체가 온다
  */
  const categoryKeys = await myCategoryKeys();
  /*
    D-276 — 브랜드·도감 명칭을 어느 언어로 띄울지. **서버에서 한 번 계산해
    넘긴다** — 클라이언트가 직접 읽으면 `/api/brands` 응답을 뷰어별로 만들어야
    하고, 그 응답은 공유 캐시에 들어가므로 남의 언어가 섞인다
  */
  const langOrder = await viewerLangOrder();

  return (
    <div className="px-4 py-5 lg:px-0">
      <h1 className="text-lg font-bold tracking-tight">{t("reg.newTitle")}</h1>
      <div className="mt-4">
        <ItemForm
          routineFieldLabels={routineFieldLabels}
          photoRequired={photoRequired}
          categoryKeys={categoryKeys}
          langOrder={langOrder}
        />
      </div>
    </div>
  );
}
