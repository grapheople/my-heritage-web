import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { CodexOwners } from "@/components/domain/codex-owners";
import { MarketCard } from "@/components/domain/market-card";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  codexListings,
  DEV_CODEX,
  DEV_CODEX_ATTRS,
  findCodex,
  resolveCodexDesc,
} from "@/lib/dev-fixture";

/**
 * S-10 도감 상세 — **이 앱에서 가장 조심해야 하는 화면이다.**
 *
 * ## ⚠️ 이중 렌더 (D-078, FR-07-A-08)
 *
 * | 영역 | 렌더 | 크롤러가 보는가 |
 * |---|---|:---:|
 * | 제품 정보 (명칭·고유값·속성·설명·검증 배지) | 서버 (ISR) | **O** |
 * | 이 도감의 판매중 매물 | 서버 (ISR) | O |
 * | **소유자 방 목록 · 보유자 수** | **클라이언트 fetch** | **✕** |
 *
 * **소유자 목록을 서버에서 조회하면 안 된다.** HTML 응답에 실려 크롤러가
 * 읽고, 검색엔진에 "고가 시계 보유자 목록"이 색인된다 — D-031 에서 수용한
 * 절도 리스크가 검색엔진 규모로 커진다.
 *
 * 게다가 차단 관계 때문에 **보유자 수가 조회 유저마다 다르다** (E-07-07) —
 * 애초에 정적 생성할 수 없는 값이다.
 *
 * ## 색인
 * 색인 대상이다 (D-078). 기본값이 noindex 이므로 여기서 켠다.
 */
export const metadata: Metadata = { robots: { index: true, follow: true } };

/** ISR — 콘텐츠가 거의 안 바뀌고 색인 대상이다. 병합·검증 시 revalidate */
export const revalidate = 3600;

export function generateStaticParams() {
  return DEV_CODEX.map((c) => ({ codexId: c.id }));
}

export default async function CodexDetailPage({
  params,
}: PageProps<"/[locale]/codex/[codexId]">) {
  const { locale, codexId } = await params;
  const t = await getTranslations();

  const entry = findCodex(codexId);
  if (!entry) notFound();

  const attrs = DEV_CODEX_ATTRS[codexId] ?? [];
  // 검증본은 3개 언어 + 폴백, 미검증본은 원문 그대로 (FR-07-A-05)
  const desc = resolveCodexDesc(codexId, locale as "ko" | "ja" | "en");
  const listings = codexListings(codexId);

  return (
    <div>
      {/* ── 제품 정보 (색인 대상) ── */}
      <header className="px-4 py-5 lg:px-0">
        <div className="aspect-[4/3] w-full rounded-lg border bg-muted lg:max-w-lg" />
        <div className="mt-4 flex items-start gap-2">
          {/* 도감 명칭은 원문 1개 고정. 번역하지 않는다 (D-009) */}
          <h1 className="flex-1 text-xl font-bold tracking-tight">
            {entry.displayName}
          </h1>
          {!entry.verified && <StatusBadge variant="unverified" />}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(entry.categoryKey)} · {entry.uniqueId}
        </p>
      </header>

      {/* 속성값 — 빈 필드는 렌더하지 않는다 (E-07-06) */}
      {attrs.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t px-4 py-5 lg:px-0">
          {attrs.map((a) => (
            <div key={a.labelKey} className="col-span-2 grid grid-cols-subgrid">
              <dt className="text-sm text-muted-foreground">{t(a.labelKey)}</dt>
              {/* 속성값은 번역하지 않는다 (policies/i18n) */}
              <dd className="text-sm font-semibold">{a.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* 설명 — 검증본은 3개 언어, 미검증본은 원문 그대로 (FR-07-A-05) */}
      {desc && (
        <section className="border-t px-4 py-5 lg:px-0">
          <p className="text-sm leading-relaxed">{desc.text}</p>
          {!desc.translated && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("codex.originalText")}
            </p>
          )}
        </section>
      )}

      {/* ── ⚠️ 소유자 목록 — 클라이언트 전용 (D-078) ── */}
      <CodexOwners codexId={codexId} />

      {/* 이 도감의 판매중 매물 (FR-07-A-04). 색인 대상이라 서버에서 낸다 */}
      {listings.length > 0 && (
        <section className="border-t px-4 py-5 lg:px-0">
          <h2 className="text-base font-bold tracking-tight">
            {t("codex.onSaleHere")}
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-3 lg:grid-cols-4">
            {listings.map((l) => (
              <li key={l.id}>
                <MarketCard listing={l} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
