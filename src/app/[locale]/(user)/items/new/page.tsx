import { getTranslations } from "next-intl/server";
import { ItemForm } from "@/components/domain/item-form";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { getRoutineFieldLabels } from "@/lib/data/item";
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

  return (
    <div className="px-4 py-5 lg:px-0">
      <h1 className="text-lg font-bold tracking-tight">{t("reg.newTitle")}</h1>
      <div className="mt-4">
        <ItemForm routineFieldLabels={routineFieldLabels} />
      </div>
    </div>
  );
}
