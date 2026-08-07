import { getTranslations } from "next-intl/server";
import { GoneSection } from "@/components/domain/gone-section";
import { Section } from "@/components/domain/section";
import { Link } from "@/i18n/navigation";
import {
  DEV_GONE_ITEMS,
  DEV_PROFILE,
  DEV_ROOM_SECTIONS,
} from "@/lib/dev-fixture";
import { formatNumber } from "@/lib/format";

/**
 * S-02 마이룸 (본인).
 *
 * 진열 메타포가 이 서비스의 차별점이다 — 그리드 리스트로 만들면 인스타의
 * 열등 복제품이 된다. 아이템 1개인 방과 50개인 방이 시각적으로 명확히 달라야
 * 하고, 그 "부피"가 자랑거리가 되어야 한다 (원칙 2).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 카테고리별 세로 스크롤 섹션 (탭·아코디언 아님) | D-068, FR-01-A-01 |
 * | 섹션 순서 = 아이템 개수 내림차순 | D-075, FR-01-A-10 |
 * | 섹션당 12/15개 + "더 보기" | D-085, FR-01-A-15·16 |
 * | 떠난 아이템은 맨 아래 · 기본 접힘 · 집계 제외 | D-023·D-086, FR-01-A-07·09·13 |
 * | 본인 방이므로 비공개 아이템도 표식과 함께 노출 | D-019, FR-01-B-01 |
 *
 * ⚠️ 데이터는 개발용 고정값이다 (`lib/dev-fixture.ts`). 인증(D-021·D-092)이
 * 붙으면 Prisma 조회로 바꾼다.
 */
export default async function MyRoomPage() {
  const t = await getTranslations();

  // 떠난 아이템은 집계에서 뺀다 (FR-01-A-07)
  const totalItems = DEV_ROOM_SECTIONS.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="lg:grid lg:grid-cols-[210px_1fr] lg:gap-6">
      {/* ── 프로필 (FR-01-C-01) ── */}
      <header className="border-b bg-card px-4 py-5 lg:col-span-2 lg:border-0 lg:px-0">
        <div className="flex items-center gap-4">
          <div className="size-15 shrink-0 rounded-full bg-muted" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {/* 방 이름은 번역하지 않는다 — 유저가 쓴 것이다 (FR-01-C-02) */}
              <h1 className="truncate text-lg font-bold tracking-tight">
                {DEV_PROFILE.roomName}
              </h1>
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold">
                {t("myRoom.level", { level: DEV_PROFILE.level })}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("myRoom.itemCount", { count: totalItems })}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{DEV_PROFILE.bio}</p>
      </header>

      {/* ── 하위 3메뉴. lg 에서 좌측 사이드로 (design-system.md §5-3) ── */}
      <nav className="sticky top-0 z-10 flex border-b bg-background lg:top-19 lg:h-fit lg:flex-col lg:self-start lg:rounded-lg lg:border">
        {(["profile", "items", "records"] as const).map((k) => (
          <span
            key={k}
            aria-current={k === "items" ? "page" : undefined}
            className={
              k === "items"
                ? "flex-1 border-b-2 border-foreground px-4 py-3 text-center text-sm font-bold lg:border-b-0 lg:bg-accent lg:text-left lg:shadow-[inset_3px_0_0_currentColor]"
                : "flex-1 px-4 py-3 text-center text-sm text-muted-foreground lg:text-left"
            }
          >
            {t(`myRoom.tab.${k}`)}
          </span>
        ))}
      </nav>

      <div className="lg:min-w-0">
        {/* ── 카테고리 진열. 개수 내림차순 (D-075) ── */}
        {DEV_ROOM_SECTIONS.map((s) => (
          <Section
            key={s.slug}
            categoryKey={s.categoryKey}
            totalCount={s.items.length}
            items={[...s.items]}
            moreHref={`/me/c/${s.slug}`}
          />
        ))}

        {/* ── 떠난 아이템. 0건이면 숨긴다 (FR-01-A-08) ── */}
        {DEV_GONE_ITEMS.length > 0 && <GoneSection items={DEV_GONE_ITEMS} />}

        <p className="px-4 py-6 text-xs text-muted-foreground lg:px-0">
          개발용 고정 데이터입니다 · 총 {formatNumber(totalItems)}개 (떠난
          아이템 {DEV_GONE_ITEMS.length}개는 집계에서 제외) ·{" "}
          <Link href="/" className="underline">
            NEW 피드
          </Link>
        </p>
      </div>
    </div>
  );
}
