"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { setItemVisibility } from "@/lib/actions/item";

/**
 * 아이템 공개·비공개 전환 (D-180, OI-78 해소).
 *
 * ## ⚠️ 이 버튼이 없어서 D-109 의 근거가 성립하지 않았다
 * D-109 는 홈을 색인으로 열면서 **"유저 통제 수단은 그대로다 — 아이템별
 * 비공개(D-019)로 피드에서 빠진다"** 를 근거로 삼았다. 그런데 `setItemVisibility`
 * 를 부르는 화면이 **한 곳도 없었다** — 통제 수단이 문서에만 있었다.
 * D-031 절도 리스크에 대한 유저의 유일한 대응 수단이다.
 *
 * ## ⚠️ 판매중 아이템을 비공개로 돌리면 마켓에서 내려간다
 * 공개 판정이 **방 AND 아이템**이라(D-019, M-06) 비공개가 되면 마켓 조회에서
 * 빠진다. 액션에 별도 로직이 없고 **조회 조건으로 자연히 빠지는 구조**이므로,
 * 그 사실을 **호출부가 미리 알려야 한다** (`actions/item.ts` 주석의 요구사항).
 */
export function ItemVisibilityToggle({
  itemId,
  visibility,
  onSale,
}: {
  itemId: string;
  visibility: "PUBLIC" | "PRIVATE";
  /** 판매중인가 — 비공개로 돌릴 때 경고를 띄운다 */
  onSale: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const goingPrivate = visibility === "PUBLIC";

  function toggle() {
    // 판매중 → 비공개는 마켓에서 내려가므로 확인을 받는다 (위 주석)
    if (goingPrivate && onSale && !window.confirm(t("item.privateOnSaleWarn"))) {
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await setItemVisibility(
        itemId,
        goingPrivate ? "PRIVATE" : "PUBLIC",
      );
      if (!res.ok) {
        setError(res.formError ?? t("error.generic"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="block w-full rounded-lg border py-3 text-center text-sm font-semibold hover:bg-accent disabled:opacity-40"
      >
        {goingPrivate ? t("item.makePrivate") : t("item.makePublic")}
      </button>
      <p className="mt-1 text-xs text-muted-foreground">
        {goingPrivate ? t("item.publicNow") : t("item.privateNow")}
      </p>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
