import { getTranslations } from "next-intl/server";
import { CodexRow } from "@/components/domain/codex-row";
import { EmptyState } from "@/components/domain/empty-state";
import { FeedCard } from "@/components/domain/feed-card";
import { RoomRow } from "@/components/domain/room-row";
import { SearchBar } from "@/components/domain/search-bar";
import { getViewer } from "@/lib/auth/viewer";
import { resolveCategory } from "@/lib/category-scope";
import { searchCodex } from "@/lib/data/codex";
import { searchItems, searchRooms } from "@/lib/data/search";

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

export default async function SearchPage({
  searchParams,
}: PageProps<"/[locale]/search">) {
  const sp = await searchParams;
  const t = await getTranslations();

  const q = typeof sp.q === "string" ? sp.q : "";
  const tab: Tab =
    sp.tab === "codex" || sp.tab === "rooms" ? sp.tab : "items";
  // ⚠️ 카테고리는 항상 하나다 (D-137). `전체` 검색은 없다
  const scope = await resolveCategory(
    typeof sp.category === "string" ? sp.category : undefined,
  );
  const category = scope.key;

  return (
    <div>
      <SearchBar q={q} tab={tab} categoryKeys={scope.keys} category={category} />

      {!q ? (
        <EmptyState title={t("search.prompt")} />
      ) : tab === "items" ? (
        <ItemResults q={q} category={category} />
      ) : tab === "codex" ? (
        <CodexResults q={q} category={category} />
      ) : (
        <RoomResults q={q} />
      )}
    </div>
  );
}

/** 아이템 — 비공개·차단은 **조회 조건**에서 빠진다 (FR-04-A-03, D-083) */
async function ItemResults({ q, category }: { q: string; category?: string }) {
  const t = await getTranslations();
  const hits = await searchItems(q, { category }, await getViewer());
  if (hits.length === 0) return <EmptyState title={t("empty.search")} />;
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-5 px-4 py-5 lg:px-0">
      {hits.map((i) => (
        <li key={i.id}><FeedCard item={i} /></li>
      ))}
    </ul>
  );
}

/** 도감 — 원문 명칭·고유값·alias 전부 매칭 (FR-04-A-04) */
async function CodexResults({ q, category }: { q: string; category?: string }) {
  const t = await getTranslations();
  const viewer = await getViewer();
  // ⚠️ 보유자 수는 로그인 유저에게만 (D-078·D-096). 조회 계층이 판정한다 —
  // 비로그인이면 `ownerCount` 키 자체가 응답에 없다
  const hits = await searchCodex(q, {
    category,
    viewer,
    withOwnerCount: viewer !== null,
  });

  if (hits.length === 0) return <EmptyState title={t("empty.search")} />;
  return (
    <div className="py-1 lg:py-2">
      {hits.map(({ entry, ownerCount, matchedAlias }) => (
        <CodexRow
          key={entry.id}
          entry={entry}
          matchedAlias={matchedAlias}
          // ⚠️ 비로그인이면 조회 계층이 **애초에 넣지 않았다** (D-096)
          ownerCount={ownerCount}
        />
      ))}
    </div>
  );
}

/** 방 — 방 이름만. 비공개 방 제외 (FR-04-A-03·06·07) */
async function RoomResults({ q }: { q: string }) {
  const t = await getTranslations();
  const hits = await searchRooms(q, await getViewer());
  if (hits.length === 0) return <EmptyState title={t("empty.search")} />;
  return (
    <div className="py-1 lg:py-2">
      {hits.map((r) => (
        <RoomRow key={r.id} id={r.id} name={r.name} level={r.level} itemCount={r.itemCount} />
      ))}
    </div>
  );
}
