import { getTranslations } from "next-intl/server";
import { CodexRow } from "@/components/domain/codex-row";
import { EmptyState } from "@/components/domain/empty-state";
import { FeedCard } from "@/components/domain/feed-card";
import { RoomRow } from "@/components/domain/room-row";
import { SearchBar } from "@/components/domain/search-bar";
import { getViewer } from "@/lib/auth/viewer";
import { resolveCategory } from "@/lib/category-scope";
import { CODEX_BROWSE_LIMIT, listCodex, searchCodex } from "@/lib/data/codex";
import { searchItems, searchRooms } from "@/lib/data/search";

/**
 * S-25 도감 탭 — 브라우즈 + 검색 (D-160).
 *
 * ## ⚠️ 이 화면이 옛 S-08(검색 탭)을 흡수한다
 * 하단 탭 3번이 **검색 → 도감**으로 바뀌었다 (D-160). 검색 화면을 **지우지
 * 않고 여기로 옮겼다** — 아이템·방 검색은 `FR-04-A-05·06·07` 이 요구하는
 * 기능이고, 탭만 바꾸면서 화면을 지우면 **진입점 0개**가 된다 (D-133·D-157·D-158
 * 에서 세 번 반복한 실패다).
 *
 * | 상태 | 화면 |
 * |---|---|
 * | 검색어 없음 | **도감 브라우즈** — 최근 추가순 |
 * | 검색어 있음 | 3개 탭 결과 — **도감이 기본**, 아이템·방은 서브탭 |
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
type Tab = "codex" | "items" | "rooms";

export default async function CodexPage({
  searchParams,
}: PageProps<"/[locale]/codex">) {
  const sp = await searchParams;

  const q = typeof sp.q === "string" ? sp.q : "";
  // ⚠️ 기본 탭이 **도감**이다. 옛 화면은 `items` 였다 (D-160)
  const tab: Tab = sp.tab === "items" || sp.tab === "rooms" ? sp.tab : "codex";
  // ⚠️ 카테고리는 항상 하나다 (D-137). `전체` 검색은 없다
  const scope = await resolveCategory(
    typeof sp.category === "string" ? sp.category : undefined,
  );
  const category = scope.key;

  return (
    <div>
      <SearchBar q={q} tab={tab} categoryKeys={scope.keys} category={category} />

      {!q ? (
        // 검색어가 없으면 **도감을 둘러본다** — 빈 안내만 두면 탭이 죽는다
        <CodexBrowse category={category} />
      ) : tab === "codex" ? (
        <CodexResults q={q} category={category} />
      ) : tab === "items" ? (
        <ItemResults q={q} category={category} />
      ) : (
        <RoomResults q={q} />
      )}
    </div>
  );
}

/**
 * 도감 브라우즈 — 최근 추가순 (D-160).
 *
 * ⚠️ **절단을 숨기지 않는다.** 상한을 넘으면 전체 개수를 함께 보여주고 검색을
 * 유도한다 — 목록이 끝인 것처럼 보이면 "도감에 이것뿐"으로 읽힌다.
 */
async function CodexBrowse({ category }: { category?: string }) {
  const t = await getTranslations();
  const viewer = await getViewer();
  const { total, hits } = await listCodex({
    category,
    viewer,
    // ⚠️ 보유자 수는 로그인 유저에게만 (D-078·D-096). 조회 계층이 판정한다
    withOwnerCount: viewer !== null,
  });

  if (hits.length === 0) return <EmptyState title={t("codex.empty")} />;
  return (
    <div className="py-1 lg:py-2">
      <p className="px-4 pt-2 pb-1 text-xs text-muted-foreground lg:px-0">
        {t("codex.recent")}
      </p>
      {hits.map(({ entry, ownerCount }) => (
        <CodexRow key={entry.id} entry={entry} ownerCount={ownerCount} />
      ))}
      {total > CODEX_BROWSE_LIMIT && (
        <p className="px-4 py-4 text-xs text-muted-foreground lg:px-0">
          {t("codex.more", { shown: hits.length, total })}
        </p>
      )}
    </div>
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

/** 아이템 — 비공개·차단은 **조회 조건**에서 빠진다 (FR-04-A-03, D-083) */
async function ItemResults({ q, category }: { q: string; category?: string }) {
  const t = await getTranslations();
  const hits = await searchItems(q, { category }, await getViewer());
  if (hits.length === 0) return <EmptyState title={t("empty.search")} />;
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-5 px-4 py-5 lg:px-0">
      {hits.map((i) => (
        <li key={i.id}>
          <FeedCard item={i} />
        </li>
      ))}
    </ul>
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
        <RoomRow
          key={r.id}
          id={r.id}
          name={r.name}
          level={r.level}
          itemCount={r.itemCount}
        />
      ))}
    </div>
  );
}
