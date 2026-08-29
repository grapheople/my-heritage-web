"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { setCategory } from "@/lib/actions/category";

/**
 * 첫 진입 카테고리 선택 — **도감 전용** (D-137, D-272).
 *
 * ## ⚠️ 홈에는 더 이상 뜨지 않는다 (D-272)
 * 홈·마켓은 **내 관심사 전체**를 보여주므로 고를 것이 없다. 하나를 골라야
 * 하는 화면은 도감뿐이고, 거기서 고른 적이 없으면 유저는 자기가 무엇을
 * 보고 있는지 모른다 — 그래서 이 컴포넌트가 도감으로 옮겨왔다.
 *
 * 선택지는 **내 관심사로 좁혀진 목록**이다 (D-273).
 *
 * ## ⚠️ 이 화면이 콘텐츠를 **대체하지 않는다**
 * 뒤에는 도감 목록이 이미 서버 렌더돼 있다. 이 컴포넌트는
 * 그 위를 덮을 뿐이다. 선택 화면만 내보내면:
 * - **D-109 홈 전체 색인**이 깨진다 — 크롤러가 받는 HTML 에 아이템이 없다
 * - **D-069 진입 즉시 콘텐츠**가 깨진다 — 관람자가 벽부터 만난다
 *
 * ## ⚠️ 닫을 수 있어야 한다
 * 고르지 않고 둘러보려는 사람을 막지 않는다. 닫으면 기본 카테고리로 본다 —
 * 다만 쿠키를 남기지 않으므로 다음 방문에 다시 묻는다.
 */
export function CategoryGate({ keys }: { keys: string[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/60 p-4">
      <div className="w-full max-w-sm rounded-xl bg-background p-6 shadow-lg">
        <h2 className="text-xl font-bold tracking-tight">
          {t("category.pickTitle")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("category.pickDesc")}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {keys.map((key) => (
            <button
              key={key}
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await setCategory(key);
                  setOpen(false);
                  // 서버 컴포넌트를 다시 그려야 피드가 그 카테고리로 바뀐다
                  router.refresh();
                })
              }
              className="rounded-lg border py-3 text-sm font-semibold hover:bg-accent disabled:opacity-40"
            >
              {t(`category.${key}`)}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-4 w-full text-center text-xs text-muted-foreground underline"
        >
          {t("category.pickLater")}
        </button>
      </div>
    </div>
  );
}
