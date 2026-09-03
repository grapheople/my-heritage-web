"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { archiveItem, unarchiveItem } from "@/lib/actions/item";

/**
 * 추억함 보관·꺼내기 (S-28, D-296).
 *
 * ## ⚠️ 삭제 옆에 나란히 선다 — 그래서 확인 문구가 중요하다
 * 유저가 "이 물건을 치우고 싶다"고 생각했을 때 선택지는 둘이고 **결과가
 * 정반대**다. 보관은 되돌릴 수 있고 하루기록이 남는다. 삭제는 되돌릴 수
 * 없고 하루기록도 함께 사라진다. 확인 창이 그 차이를 말하지 않으면
 * 유저는 둘을 같은 것으로 읽는다.
 *
 * ## ⚠️ 보관은 확인을 받고 꺼내기는 받지 않는다
 * 꺼내기는 **되돌리는 동작**이라 실수해도 다시 넣으면 그만이다. 되돌릴 수
 * 있는 것에 확인 창을 붙이면 확인 창 자체가 값싸 보인다 (삭제 확인도 같이
 * 가벼워진다).
 *
 * `ItemVisibilityToggle`·`SaleStatusActions` 와 같은 자리·같은 모양이다 —
 * 아이템 상태를 바꾸는 수단은 전부 소유자 액션 영역에 모인다 (D-180).
 */
export function ItemArchiveActions({
  itemId,
  archived,
  /** 부품은 보관할 수 없다 (D-296) — 먼저 떼어내야 한다 */
  isPart = false,
  labels,
}: {
  itemId: string;
  archived: boolean;
  isPart?: boolean;
  labels: { archive: string; archiveConfirm: string; unarchive: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  // 부품이면 진열에 애초에 없다 — 보관 버튼을 낼 이유가 없다
  if (isPart && !archived) return null;

  const run = (fn: () => Promise<{ ok: boolean; formError?: string }>) => {
    setError("");
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.formError ?? "");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (archived) {
            run(() => unarchiveItem(itemId));
            return;
          }
          if (!window.confirm(labels.archiveConfirm)) return;
          run(() => archiveItem(itemId));
        }}
        className="block w-full rounded-lg border py-3 text-center text-sm font-semibold hover:bg-accent disabled:opacity-40"
      >
        {archived ? labels.unarchive : labels.archive}
      </button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
