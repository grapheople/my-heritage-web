import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { SellForm } from "@/components/domain/sell-form";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { getItemDetail } from "@/lib/data/item";

/**
 * S-18 판매 전환 (D-050).
 *
 * ## "토글 한 번"이 원칙이다
 * 아이템의 사진·속성·연결된 일기를 **매물 정보로 그대로 쓴다** (FR-01-A-06,
 * 원칙 1). 상품 설명을 새로 쓰게 만들면 실패다 — 그게 이 서비스의 차별점이다.
 * 유저가 새로 채우는 것은 **가격·통화·링크 3개뿐**이다.
 *
 * 판매 전환으로 경험치를 주지 않는다 (FR-01-A-07, D-026) — 경험치는 소유·기록의
 * 리듬이고 거래 유인이 아니다 (원칙 7).
 */
export default async function SellPage({
  params,
}: PageProps<"/[locale]/items/[itemId]/sell">) {
  const { locale, itemId } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  if (!viewer) {
    redirect({ href: "/login", locale });
    return null;
  }

  const item = await getItemDetail(itemId, viewer);
  if (!item) notFound();

  // 소유자만 (FR-05-B-01, D-019)
  if (viewer.roomId !== item.roomId) notFound();

  // 떠난 아이템은 다시 팔 수 없다 (D-023 — 현재 보유자가 아니다)
  if (item.saleStatus === "SOLD") notFound();

  return (
    <div className="px-4 py-5 lg:px-0">
      <h1 className="text-lg font-bold tracking-tight">
        {item.saleStatus === "ON_SALE" ? t("sell.editListing") : t("sell.convert")}
      </h1>
      {/* 재입력 요구 금지의 근거를 화면에서도 밝힌다 (FR-01-A-06) */}
      <p className="mt-1 text-sm text-muted-foreground">{t("sell.reuseNotice")}</p>

      <div className="mt-4 flex items-center gap-3 rounded-lg border p-3">
        <span className="size-12 shrink-0 rounded-md bg-muted" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{item.name}</p>
          <p className="text-xs text-muted-foreground">{t(item.categoryKey)}</p>
        </div>
      </div>

      <SellForm
        locale={locale}
        isPrivate={item.visibility === "PRIVATE"}
        onSale={item.saleStatus === "ON_SALE"}
        initial={item.sale}
      />
    </div>
  );
}
