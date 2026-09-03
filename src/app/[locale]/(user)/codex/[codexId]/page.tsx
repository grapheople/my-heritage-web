import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { CodexWearShots } from "@/components/domain/codex-wear-shots";
import { ExternalLinkWarning } from "@/components/common/external-link-warning";
import { MuscleMap } from "@/components/domain/muscle-map";
import { MarketCard } from "@/components/domain/market-card";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  getCodexAttrs,
  getCodexDesc,
  getCodexListings,
  getCodexPublic,
  getExerciseDetail,
} from "@/lib/data/codex";
import { localeAlternates } from "@/lib/site";

/**
 * S-10 도감 상세 — **이 앱에서 가장 조심해야 하는 화면이다.**
 *
 * ## ⚠️ 이중 렌더 (D-078, FR-07-A-08)
 *
 * | 영역 | 렌더 | 크롤러가 보는가 |
 * |---|---|:---:|
 * | 제품 정보 (명칭·고유값·속성·설명·검증 배지) | 서버 | **O** |
 * | 이 도감의 판매중 매물 | 서버 | O |
 * | **하루기록 목록 (사진·방 이름·날짜)** | **클라이언트 fetch** | **✕** |
 *
 * **하루기록 목록을 서버에서 조회하면 안 된다.** HTML 응답에 실려 크롤러가
 * 읽고, 검색엔진에 "고가 시계를 착용한 사진 + 소유자 방"이 색인된다 —
 * D-031 에서 수용한 절도 리스크가 검색엔진 규모로 커진다.
 *
 * ⚠️ 이 자리에는 **소유자 목록**이 있었다 (D-078). D-162 에서 하루기록으로
 * 바꿨고, **노출은 오히려 강해졌다** — 같은 규칙을 더 엄격하게 지켜야 한다.
 *
 * 게다가 차단 관계 때문에 **결과가 조회 유저마다 다르다** (E-07-07) —
 * 애초에 정적 생성할 수 없는 값이다.
 *
 * ## 색인
 * 색인 대상이다 (D-078). 기본값이 noindex 이므로 여기서 켠다.
 */
export async function generateMetadata({
  params,
}: PageProps<"/[locale]/codex/[codexId]">): Promise<Metadata> {
  const { codexId } = await params;
  const entry = await getCodexPublic(codexId);
  if (!entry) return {};
  return {
    title: entry.displayName,
    robots: { index: true, follow: true },
    alternates: { languages: localeAlternates(`/codex/${codexId}`) },
  };
}

/**
 * ⚠️ **이 값은 지금 효과가 없다 — 실제로는 SSR 이다** (OI-60).
 *
 * `(user)/layout.tsx` 가 `isLoggedIn()` 을 부르고 그게 쿠키를 읽어서
 * **세그먼트 전체가 동적 렌더로 떨어진다.** `pnpm build` 의 라우트 표에서
 * `ƒ (Dynamic)` 로 확인된다.
 *
 * 레이아웃이 `loggedIn` 을 쓰는 곳은 **알림 벨 노출 하나뿐**이다
 * (FR-08-A-07). 그것만 클라이언트로 내리면 ISR 이 살아나지만 벨이 늦게
 * 나타난다 — 어느 쪽이 나은지는 기획 판단이라 OI 로 둔다.
 *
 * 값을 지우지 않고 남긴 이유: 레이아웃이 정리되는 순간 의도했던 캐시 정책이
 * 바로 적용되게 하려는 것이다. 병합·검증 시 revalidate 하는 전제도 그대로다.
 */
export const revalidate = 3600;

/**
 * ⚠️ **`generateStaticParams` 를 두지 않는다** (2026-08-08 제거).
 *
 * 이 페이지는 이미 **동적 렌더**다 — 레이아웃이 쿠키를 읽어서다 (OI-60).
 * 그래서 사전 생성 목록은 **아무 효과가 없는데 빌드를 DB 에 묶는다.**
 * 실제로 DB 에 못 닿는 네트워크에서 **빌드가 이것 때문에 실패했다** (D-113).
 *
 * OI-60 을 해소해 ISR 이 살아나면 그때 되살린다:
 *
 *     export async function generateStaticParams() {
 *       return (await allCodexIds()).map((codexId) => ({ codexId }));
 *     }
 *
 * `allCodexIds()` 는 sitemap 이 계속 쓴다 — 함수 자체는 남겨둔다.
 */

export default async function CodexDetailPage({
  params,
}: PageProps<"/[locale]/codex/[codexId]">) {
  const { locale, codexId } = await params;
  const t = await getTranslations();

  // ⚠️ 뷰어를 넘기지 않는다 — 이 경로에서 보유자 수를 계산할 길을 막는다 (D-078)
  const entry = await getCodexPublic(codexId);
  if (!entry) notFound();

  const [attrs, desc, listings, exercise] = await Promise.all([
    getCodexAttrs(codexId, locale as Locale),
    // 검증본은 3개 언어 + 폴백, 미검증본은 원문 그대로 (FR-07-A-05)
    getCodexDesc(codexId, locale as "ko" | "ja" | "en"),
    getCodexListings(codexId),
    /*
      운동이면 분류·영상·자극부위가 **마스터에서** 온다 (D-227, `FR-11-C-02`).
      운동이 아니면 `null` 이라 아래 섹션이 렌더되지 않는다
    */
    getExerciseDetail(codexId, locale as Locale),
  ]);

  return (
    <div>
      {/* ── 제품 정보 (색인 대상) ── */}
      <header className="px-4 py-5 lg:px-0">
        {/* 대표 이미지 — **연결된 공개 아이템의 사진을 빌려 쓴다** (D-110).
            도감에는 사진 필드가 없고, 후보가 없으면 빈 자리로 남는다 */}
        {/* ⚠️ 4:3 이 아니라 **정방형**이다 (D-131). 빌려 쓰는 아이템 사진이
              이미 정방형이라 4:3 은 두 번 자르는 셈이 된다 */}
          <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-muted lg:max-w-lg">
          {entry.imageUrl ? (
            <Image
              src={entry.imageUrl}
              alt={entry.displayName}
              fill
              sizes="(min-width:1024px) 512px, 100vw"
              className="object-cover"
              priority
            />
          ) : (
            /*
              ⚠️ **운동 도감에는 빌려 쓸 사진이 없다** (D-227). 아이템이 이 도감을
              가리키지 않으므로 `imageUrl` 이 언제나 빈다. 그 자리를 **근육맵**으로
              채운다 — 루틴 카드가 이미 쓰는 방식이다 (D-222·D-223, `FR-07-A-14`)
            */
            exercise && (
              <MuscleMap
                muscles={exercise.muscles}
                className="h-full w-full"
                title={entry.displayName}
              />
            )
          )}
        </div>
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
            <div key={a.key} className="col-span-2 grid grid-cols-subgrid">
              <dt className="text-sm text-muted-foreground">{a.label}</dt>
              {/* 속성값은 번역하지 않는다 (policies/i18n) */}
              <dd className="text-sm font-semibold">{a.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/*
        운동 분류 — 자극부위·장비·복합단일·밀기당기기 (`FR-11-C-02`).
        ⚠️ 위의 `attrs`(매칭 키 파생)와 **다른 출처**라 섹션을 나눈다
      */}
      {exercise && exercise.attrs.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t px-4 py-5 lg:px-0">
          {exercise.attrs.map((a) => (
            <div key={a.key} className="col-span-2 grid grid-cols-subgrid">
              <dt className="text-sm text-muted-foreground">{a.label}</dt>
              <dd className="text-sm font-semibold">{a.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/*
        폼 시연 영상 — **외부 링크 경고를 거친다** (D-040·D-028). 직접 `<a>` 로
        내보내면 그 경고를 우회하게 된다
      */}
      {exercise?.referenceUrl && (
        <section className="border-t px-4 py-5 lg:px-0">
          <ExternalLinkWarning
            href={exercise.referenceUrl}
            className="text-sm font-semibold underline"
          >
            {t("codex.exerciseReference")}
          </ExternalLinkWarning>
        </section>
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

      {/*
        ── ⚠️ 하루기록 목록 — 클라이언트 전용 (D-162, D-078 상속) ──
        옛 소유자 목록을 대체한다. **노출은 더 강하다**(사진·방 이름·날짜) —
        서버 컴포넌트로 바꾸면 크롤러가 읽는다.
      */}
      <CodexWearShots codexId={codexId} categoryKey={entry.categoryKey} />

      {/* 이 도감의 판매중 매물 (FR-07-A-04). 색인 대상이라 서버에서 낸다 */}
      {listings.length > 0 && (
        <section className="border-t px-4 py-5 lg:px-0">
          <h2 className="text-base font-bold tracking-tight">
            {/*
              ⚠️ 카테고리 이름을 끼워 넣는다 (D-172, D-171 과 같은 방식). 문구를
              카테고리별로 열거하지 않는다 — 어드민이 늘리면 그때마다 추가해야 한다
            */}
            {t("codex.onSaleHere", { category: t(entry.categoryKey) })}
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-5">
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
