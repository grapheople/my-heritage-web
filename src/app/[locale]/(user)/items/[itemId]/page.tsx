import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { SaleStatusActions } from "@/components/domain/sale-status-actions";
import { StatusBadge } from "@/components/domain/status-badge";
import { ExternalLinkWarning } from "@/components/common/external-link-warning";
import { Link } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { getItemDetail, isItemIndexable } from "@/lib/data/item";
import { formatPrice, ownershipDuration } from "@/lib/format";
import { localeAlternates } from "@/lib/site";

/**
 * S-05 아이템 상세.
 *
 * ## ⚠️ 조건부 색인 (D-093)
 *
 * 같은 라우트가 **데이터 상태에 따라 색인 여부가 갈린다.**
 *
 * | 상태 | 색인 |
 * |---|:---:|
 * | 판매중 + 아이템 공개 + 방 공개 | **O** |
 * | 판매중이지만 비공개 | ✕ |
 * | 비판매 (전시중) | ✕ |
 * | 떠난 아이템 (판매완료) | ✕ |
 *
 * 판매 의사가 없는 소장품이 색인되면 **D-031 절도 리스크를 아이템 단위로
 * 다시 키운다.** 마켓 유입(D-046)은 살리되 소장품은 노출하지 않는다.
 *
 * 판매중 → 비판매로 되돌리면 색인을 내려야 한다 — 사이트맵 제거 + noindex.
 * 이미 색인된 것은 크롤러 재방문까지 남는다는 점을 감수한다 (D-093).
 *
 * ## 뷰어 분기
 * **타인 아이템에는 구매처·구매일·구매가를 표시하지 않는다** (FR-06-A-05, D-019).
 * 대신 소유 기간만 노출한다 (FR-06-A-06) — 마켓의 신뢰 지표다.
 */
export async function generateMetadata({
  params,
}: PageProps<"/[locale]/items/[itemId]">): Promise<Metadata> {
  const { itemId } = await params;
  // ⚠️ 메타데이터는 **비로그인 기준**으로 판정해야 한다 — 뷰어를 넘기면
  // 소유자에게만 보이는 아이템이 색인 대상으로 잡힌다 (D-093)
  const item = await getItemDetail(itemId, null);
  // 기본값은 layout 의 noindex 다. 색인 조건을 만족할 때만 켠다 (D-093)
  if (!item || !isItemIndexable(item)) return {};
  return {
    title: item.name,
    robots: { index: true, follow: true },
    alternates: { languages: localeAlternates(`/items/${itemId}`) },
  };
}

export default async function ItemDetailPage({
  params,
}: PageProps<"/[locale]/items/[itemId]">) {
  const { itemId } = await params;
  const t = await getTranslations();

  const viewer = await getViewer();
  // 공개 판정(Room AND Item)·차단·소유 정보 제거는 조회 계층에서 끝난다.
  // 볼 수 없는 아이템은 **응답 자체가 없다** (D-019, D-083)
  const item = await getItemDetail(itemId, viewer);
  if (!item) notFound();

  const isOwner = viewer?.roomId === item.roomId;

  const owned = item.owner.purchaseDate
    ? ownershipDuration(new Date(item.owner.purchaseDate))
    : null;

  return (
    <div>
      {/* 대표 이미지 = 첫 장 (FR-07-A-04). 아이템은 1장 이상이 보장된다 */}
      <div className="relative aspect-square w-full overflow-hidden border-b bg-muted lg:aspect-[16/9]">
        {item.photos[0] && (
          <Image
            src={item.photos[0]}
            alt={item.name}
            fill
            sizes="(min-width:1024px) 1200px, 100vw"
            className="object-cover"
            priority
          />
        )}
      </div>

      {/* 나머지 사진 (FR-07-A-01) */}
      {item.photos.length > 1 && (
        <div className="grid grid-cols-4 gap-1 border-b p-1">
          {item.photos.slice(1).map((url) => (
            <div key={url} className="relative aspect-square overflow-hidden rounded-sm bg-muted">
              <Image src={url} alt="" fill sizes="25vw" className="object-cover" />
            </div>
          ))}
        </div>
      )}

      <header className="px-4 py-5 lg:px-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.saleStatus === "ON_SALE" && <StatusBadge variant="sale" />}
          {isOwner && item.visibility === "PRIVATE" && (
            <StatusBadge variant="private" />
          )}
        </div>
        {/* 아이템 명칭은 파생값이고 번역하지 않는다 (D-073) */}
        <h1 className="mt-2 text-xl font-bold tracking-tight">{item.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(item.categoryKey)}
        </p>

        {/* 판매중 — 현재 가격만. 변경 이력·인하 표식 없음 (D-063, FR-03-A-11) */}
        {item.sale && (
          <p className="mt-3 text-2xl font-bold tracking-tight">
            {formatPrice(item.sale.price, item.sale.currency)}
          </p>
        )}
      </header>

      {/* 판매자 정보 (FR-03-A-05·06) */}
      <section className="flex items-center gap-3 border-t px-4 py-4 lg:px-0">
        <span className="size-10 shrink-0 rounded-full bg-muted" />
        <Link
          href={`/rooms/${item.roomId}`}
          className="min-w-0 flex-1 hover:underline"
        >
          <span className="block truncate text-sm font-semibold">
            {item.roomName}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("myRoom.level", { level: item.ownerLevel })}
          </span>
        </Link>
        {/* 소유 기간 — 구매일 자체는 노출하지 않는다 (FR-03-A-03) */}
        {owned && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("item.ownedForLabel")}{" "}
            {t("item.ownedFor", owned)}
          </span>
        )}
      </section>

      {/* 거래 링크 — 반드시 공통 경고 컴포넌트 경유 (D-040).
          인앱 공개 문의는 제공하지 않는다 (FR-03-A-10, D-062) */}
      {item.sale && (
        <section className="border-t px-4 py-4 lg:px-0">
          <ExternalLinkWarning
            href={item.sale.url}
            className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {t("market.goToDeal")}
          </ExternalLinkWarning>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("market.dealDisclaimer")}
          </p>
        </section>
      )}

      {/* 소유자 액션 — 판매 전환·취소·완료 (market F-01) */}
      {isOwner && (
        <section className="flex flex-col gap-2 border-t px-4 py-4 lg:px-0">
          {/* 떠난 아이템은 다시 팔 수 없다 (D-023) — 되돌리기만 제공한다 */}
          {item.saleStatus !== "SOLD" && (
            <Link
              href={`/items/${item.id}/sell`}
              className="block w-full rounded-lg border py-3 text-center text-sm font-semibold hover:bg-accent"
            >
              {item.saleStatus === "ON_SALE"
                ? t("sell.editListing")
                : t("sell.convert")}
            </Link>
          )}
          <SaleStatusActions itemId={item.id} saleStatus={item.saleStatus} />
        </section>
      )}

      {/* 속성값 — 활성 항목만, 빈 값은 렌더하지 않는다 (FR-06-A-01·02).
          속성값은 번역하지 않는다 (FR-03-A-09) */}
      {item.attrs.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t px-4 py-5 lg:px-0">
          {item.attrs.map((a) => (
            <div key={a.labelKey} className="col-span-2 grid grid-cols-subgrid">
              <dt className="text-sm text-muted-foreground">{t(a.labelKey)}</dt>
              <dd className="text-sm font-semibold">{a.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* ⚠️ 소유자만 (FR-06-A-05, D-019) — 구매가가 노출되면 방이 재산 목록이 된다 */}
      {isOwner &&
        (item.owner.purchasedFrom ||
          item.owner.purchaseDate ||
          item.owner.purchasePrice) && (
          <section className="border-t bg-muted/40 px-4 py-5 lg:px-0 lg:rounded-lg">
            <h2 className="text-sm font-bold">{t("item.ownerOnly")}</h2>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
              {item.owner.purchasedFrom && (
                <div className="col-span-2 grid grid-cols-subgrid">
                  <dt className="text-sm text-muted-foreground">{t("attr.purchasedFrom")}</dt>
                  <dd className="text-sm">{item.owner.purchasedFrom}</dd>
                </div>
              )}
              {item.owner.purchaseDate && (
                <div className="col-span-2 grid grid-cols-subgrid">
                  <dt className="text-sm text-muted-foreground">{t("attr.purchaseDate")}</dt>
                  <dd className="text-sm">{item.owner.purchaseDate}</dd>
                </div>
              )}
              {item.owner.purchasePrice && (
                <div className="col-span-2 grid grid-cols-subgrid">
                  <dt className="text-sm text-muted-foreground">{t("attr.purchasePrice")}</dt>
                  <dd className="text-sm">{item.owner.purchasePrice}</dd>
                </div>
              )}
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("item.ownerOnlyHint")}
            </p>
          </section>
        )}

      {/* 참고 링크(`url` 속성) — 거래 링크와 같은 경고를 쓴다 (D-040) */}
      {item.refUrl && (
        <section className="border-t px-4 py-4 lg:px-0">
          <ExternalLinkWarning
            href={item.refUrl}
            className="text-sm text-muted-foreground underline"
          >
            {t("attr.refUrl")}
          </ExternalLinkWarning>
        </section>
      )}

      {/* 도감 연결 (FR-06-A-03) */}
      {item.codexId ? (
        <section className="border-t px-4 py-4 lg:px-0">
          <Link
            href={`/codex/${item.codexId}`}
            className="text-sm font-semibold underline"
          >
            {t("codex.goToCodex")}
          </Link>
        </section>
      ) : (
        <section className="border-t px-4 py-4 lg:px-0">
          <p className="text-xs text-muted-foreground">{t("codex.notLinked")}</p>
        </section>
      )}

      {/* 연결된 공개 일기 (FR-06-A-04, FR-03-A-04) — 원칙 1의 증거다 */}
      {item.diaries.length > 0 && (
        <section className="border-t px-4 py-5 lg:px-0">
          <h2 className="text-base font-bold tracking-tight">
            {t("item.linkedDiaries", { count: item.diaries.length })}
          </h2>
          <ul className="mt-3 divide-y">
            {item.diaries.map((d) => (
              <li key={d.id}>
                <Link href={`/diaries/${d.id}`} className="block py-3 hover:underline">
                  <span className="block text-xs text-muted-foreground">{d.date}</span>
                  {/* 일기 본문은 유저 콘텐츠 — 번역하지 않는다 */}
                  <span className="mt-0.5 block text-sm">{d.excerpt}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 신고 (FR-03-A-08, D-029) */}
      {!isOwner && (
        <section className="border-t px-4 py-4 lg:px-0">
          <Link
            href={`/report?target=item&id=${item.id}`}
            className="text-xs text-muted-foreground underline"
          >
            {t("report.reportThis")}
          </Link>
        </section>
      )}
    </div>
  );
}
