import { getTranslations } from "next-intl/server";
import { CodexRow } from "@/components/domain/codex-row";
import { EmptyState } from "@/components/domain/empty-state";
import { FeedCard } from "@/components/domain/feed-card";
import { RoomRow } from "@/components/domain/room-row";
import { SearchBar } from "@/components/domain/search-bar";
import { DEV_CODEX, DEV_FEED, DEV_ROOMS } from "@/lib/dev-fixture";

/**
 * S-08 통합 검색 — 아이템 · 도감 · 방 3개 탭 (FR-04-A-01).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | **일기는 검색 대상이 아니다** | D-020, FR-04-A-02 |
 * | 비공개 아이템·비공개 방 제외 | D-019, FR-04-A-03 |
 * | 도감은 원문 명칭·고유값·**3개 언어 alias** 전부 대상 | D-009, FR-04-A-04 |
 * | 방은 **방 이름만**. 유저 소개는 제외 | FR-04-A-06·07 |
 * | 카테고리 필터는 아이템·도감 탭에만 | FR-04-A-09 |
 * | **언어권 필터를 적용하지 않는다** | D-027, FR-03-B-07 |
 * | 탭별 빈 상태 | FR-04-A-08 |
 */
type Tab = "items" | "codex" | "rooms";

function norm(s: string): string {
  // NFKC + 공백·하이픈 제거 + 소문자 (D-014 정규화 규칙의 축약판)
  return s.normalize("NFKC").toLowerCase().replace(/[\s-]/g, "");
}

export default async function SearchPage({
  searchParams,
}: PageProps<"/[locale]/search">) {
  const sp = await searchParams;
  const t = await getTranslations();

  const q = typeof sp.q === "string" ? sp.q : "";
  const tab: Tab =
    sp.tab === "codex" || sp.tab === "rooms" ? sp.tab : "items";
  const category = typeof sp.category === "string" ? sp.category : undefined;
  const nq = norm(q);

  return (
    <div>
      <SearchBar q={q} tab={tab} category={category} />

      {!q ? (
        <EmptyState title={t("search.prompt")} />
      ) : tab === "items" ? (
        <ItemResults nq={nq} category={category} />
      ) : tab === "codex" ? (
        <CodexResults nq={nq} category={category} />
      ) : (
        <RoomResults nq={nq} />
      )}
    </div>
  );
}

/** 아이템 — 비공개는 DEV_FEED 단계에서 이미 제외돼 있다 (FR-04-A-03) */
async function ItemResults({ nq, category }: { nq: string; category?: string }) {
  const t = await getTranslations();
  const hits = DEV_FEED.filter(
    (i) =>
      norm(i.name).includes(nq) &&
      (!category || i.categoryKey === `category.${category}`),
  );
  if (hits.length === 0) return <EmptyState title={t("empty.search")} />;
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-5 px-4 py-5 md:grid-cols-3 lg:grid-cols-4 lg:px-0">
      {hits.map((i) => (
        <li key={i.id}><FeedCard item={i} /></li>
      ))}
    </ul>
  );
}

/** 도감 — 원문 명칭·고유값·alias 전부 매칭 (FR-04-A-04) */
async function CodexResults({ nq, category }: { nq: string; category?: string }) {
  const t = await getTranslations();
  const hits = DEV_CODEX
    .filter((c) => !category || c.categoryKey === `category.${category}`)
    .map((c) => {
      const direct =
        norm(c.displayName).includes(nq) || norm(c.uniqueId).includes(nq);
      const alias = c.aliases.find((a) => norm(a).includes(nq));
      return { c, hit: direct || Boolean(alias), alias: direct ? undefined : alias };
    })
    .filter((r) => r.hit);

  if (hits.length === 0) return <EmptyState title={t("empty.search")} />;
  return (
    <div className="py-1 lg:py-2">
      {hits.map(({ c, alias }) => (
        <CodexRow key={c.id} entry={c} matchedAlias={alias} />
      ))}
    </div>
  );
}

/** 방 — 방 이름만. 비공개 방 제외 (FR-04-A-03·06·07) */
async function RoomResults({ nq }: { nq: string }) {
  const t = await getTranslations();
  const hits = DEV_ROOMS.filter(
    (r) => r.isPublic && norm(r.name).includes(nq),
  );
  if (hits.length === 0) return <EmptyState title={t("empty.search")} />;
  return (
    <div className="py-1 lg:py-2">
      {hits.map((r) => (
        <RoomRow
          key={r.id}
          id={r.id}
          name={r.name}
          level={r.level}
          itemCount={r.sections.reduce(
            (n, s) => n + s.items.filter((i) => !i.isPrivate).length, 0,
          )}
        />
      ))}
    </div>
  );
}
