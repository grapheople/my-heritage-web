import type { CodexAttr, CodexEntry, MarketListing } from "@/lib/data/types";
import type { Viewer } from "@/lib/auth/viewer";
import { normalizeBrandToken } from "@/lib/brand-search";
import { blockedUserIds, publicRoomWhere } from "@/lib/data/scope";
import { deriveItemName, NAME_SELECT } from "@/lib/data/item-name";
import { realPhotoUrl } from "@/lib/data/photo";
import type { Locale } from "@/i18n/routing";
import { pickAttrLabel } from "@/lib/data/label";
import { prisma } from "@/lib/prisma";

/** 소유자 목록·보유자 수 집계에 공통으로 쓰는 아이템 조건 */
function ownerItemWhere(blockedIds: string[]) {
  return {
    visibility: "PUBLIC" as const,
    // 판매완료는 **현재 보유자가 아니다** (D-023, FR-07-B-06, E-07-05)
    saleStatus: { not: "SOLD" as const },
    room: publicRoomWhere(blockedIds),
  };
}

type CodexRow = {
  id: string;
  displayName: string;
  uniqueId: string | null;
  verification: "UNVERIFIED" | "VERIFIED";
  aliases: unknown;
  category: { key: string };
  /** FR-06-C-08 — 키 alias (이미 정규화된 값이다) */
  matchKeys?: { value: string }[];
};

function aliasList(aliases: unknown): string[] {
  if (!aliases || typeof aliases !== "object") return [];
  const a = aliases as Record<string, unknown>;
  return (["ko", "ja", "en"] as const).flatMap((k) =>
    Array.isArray(a[k]) ? (a[k] as unknown[]).filter((v): v is string => typeof v === "string") : [],
  );
}

/**
 * 보유자 수 (FR-07-A-02 · **FR-07-C-01~05**).
 *
 * ⚠️ **사람 단위다** — 한 유저가 같은 도감의 아이템을 2개 이상 가져도 1로 센다
 * (E-07-01). 그래서 아이템이 아니라 **방을 distinct** 로 센다.
 *
 * ⚠️ **조회 유저마다 값이 다르다** (E-07-07, D-051) — 차단 관계가 빠지기
 * 때문이다. 그래서 전역 캐시에 올릴 수 없다 (FR-07-B-09).
 *
 * ## ⚠️ 운동 도감은 경로가 하나 더 길다 (D-227·D-228)
 * 운동은 **아이템이 아니다.** 운동 카테고리의 아이템은 루틴뿐이고 루틴은 도감을
 * 갖지 않으므로(`FR-10-A-02`), `Item.codexItemId` 로 세면 **모든 운동 도감이
 * 0명**이 된다. 운동의 보유자는 **그 운동을 루틴에 담은 유저**다:
 *
 * ```
 * Exercise → RoutineExercise → Item(루틴) → Room → User
 * ```
 *
 * ⚠️ **분기를 이 함수 안에만 둔다** (`FR-07-C-02`). 보유자 수는 도감 상세 ·
 * 도감 목록 · 검색 결과 row **세 곳**에 나온다(`FR-06-B-06`). 세 곳이 각자 세면
 * **한 곳만 분기를 빠뜨려도 그 화면에서만 0명**이다 — D-221 이 진열 조건에서
 * 겪은 것과 같은 유형이다.
 *
 * ⚠️ **공개·차단 조건은 완전히 같다** (`FR-07-C-04`). 다른 것은 **판매완료
 * 제외가 무의미**하다는 점뿐이다 — 운동은 팔지 않는다 (D-173, `FR-07-C-05`).
 * 루틴에 `saleStatus` 조건을 그대로 걸어도 결과가 같으므로 **같은 조건을 재사용**
 * 한다. 규칙을 두 벌로 만들지 않는다.
 */
async function ownerCounts(
  codexIds: string[],
  blockedIds: string[],
): Promise<Map<string, number>> {
  if (codexIds.length === 0) return new Map();

  const [items, routines] = await Promise.all([
    prisma.item.findMany({
      where: { codexItemId: { in: codexIds }, ...ownerItemWhere(blockedIds) },
      select: { codexItemId: true, roomId: true },
    }),
    /*
      운동 몫. `codexIds` 에 운동이 없으면 빈 배열이라 **추가 비용이 사실상
      없다** — 카테고리를 미리 조회해 분기하면 쿼리가 하나 더 늘고, 그 조회가
      빠지는 경로가 또 생긴다
    */
    /*
      ⚠️ **운동 항목만 센다** (D-236). 휴식 항목은 `exercise` 가 `null` 이라
      `exercise: { … }` 조건이 이미 걸러내지만, 의도를 드러내기 위해 `kind` 도
      함께 건다 — 휴식이 방을 중복 계산하게 두면 보유자 수가 부풀려진다
    */
    prisma.routineEntry.findMany({
      where: {
        kind: "EXERCISE",
        exercise: { codexItemId: { in: codexIds } },
        routine: ownerItemWhere(blockedIds),
      },
      select: { exercise: { select: { codexItemId: true } }, routine: { select: { roomId: true } } },
    }),
  ]);

  const byCodex = new Map<string, Set<string>>();
  const add = (codexId: string | null | undefined, roomId: string) => {
    if (!codexId) return;
    const set = byCodex.get(codexId) ?? new Set<string>();
    // ⚠️ **방 단위 집합**이라 한 유저가 루틴 2개에 같은 운동을 담아도 1명이다
    // (`FR-07-C-03`, AC-07-C-03-1)
    set.add(roomId);
    byCodex.set(codexId, set);
  };

  for (const r of items) add(r.codexItemId, r.roomId);
  for (const r of routines) add(r.exercise?.codexItemId, r.routine.roomId);

  return new Map([...byCodex].map(([id, set]) => [id, set.size]));
}

/**
 * ⚠️ **`ownerCount` 가 없는 타입이다** (D-078·D-096).
 *
 * 서버 렌더·ISR 경로가 쓰는 형태다. 보유자 수를 담을 자리가 아예 없어야
 * 실수로 HTML 에 실리지 않는다 — **타입이 규칙을 강제한다.**
 * 보유자 수가 필요한 곳은 로그인 판정 후 `ownerCount` 를 따로 받는다.
 */
export type CodexPublic = Omit<CodexEntry, "ownerCount">;

/**
 * 도감 대표 이미지 (D-110).
 *
 * ⚠️ **연결된 아이템의 사진을 빌려 쓴다.** 도감에는 사진 필드가 없다 —
 * 별도 필드를 두면 도감마다 사진 1장을 운영이 넣어야 하고, 도감은 유저 등록으로
 * 자동 생성되므로(D-015) 큐가 무한히 쌓인다.
 *
 * ## ⚠️ 후보 조건을 좁게 잡는 것이 D-019 충돌을 막는다
 * **공개 아이템 + 공개 방 + 판매완료 아님**만 후보다 — 보유자 수 집계와
 * **같은 조건**이다 (FR-07-B-01·02·06).
 *
 * **조회 시점에 매번 고른다.** 값을 저장하면 아이템이 비공개로 바뀌거나
 * 삭제됐을 때 **사라진 사진을 가리킨다.** 쿼리로 두면 자동으로 빠진다.
 *
 * ⚠️ **차단 관계는 적용하지 않는다.** 도감 상세는 비로그인·크롤러도 보는
 * 경로이고(D-098), 유저별로 다른 이미지를 내면 캐시할 수 없다.
 */
async function codexImages(codexIds: string[]): Promise<Map<string, string>> {
  if (codexIds.length === 0) return new Map();
  const rows = await prisma.item.findMany({
    where: {
      codexItemId: { in: codexIds },
      visibility: "PUBLIC",
      saleStatus: { not: "SOLD" },
      room: { visibility: "PUBLIC", user: { deletedAt: null } },
      photos: { some: {} },
    },
    select: {
      codexItemId: true,
      photos: { select: { url: true }, orderBy: { displayOrder: "asc" }, take: 1 },
    },
    // 오래된 것부터 — 같은 도감을 여러 번 열어도 같은 사진이 나와야 한다.
    // 최신순이면 새 아이템이 등록될 때마다 도감 대표가 바뀐다
    orderBy: { createdAt: "asc" },
  });
  const out = new Map<string, string>();
  for (const r of rows) {
    if (!r.codexItemId || out.has(r.codexItemId)) continue;
    const url = realPhotoUrl(r.photos[0]?.url);
    if (url) out.set(r.codexItemId, url);
  }
  return out;
}

function toPublic(c: CodexRow, imageUrl?: string): CodexPublic {
  return {
    id: c.id,
    displayName: c.displayName,
    categoryKey: `category.${c.category.key}`,
    uniqueId: c.uniqueId ?? "",
    verified: c.verification === "VERIFIED",
    aliases: aliasList(c.aliases),
    // 연결된 공개 아이템의 사진. 후보가 없으면 이미지 없이 렌더한다 (D-110)
    imageUrl,
  };
}

const CODEX_SELECT = {
  id: true,
  displayName: true,
  uniqueId: true,
  verification: true,
  aliases: true,
  category: { select: { key: true } },
  /*
    FR-06-C-08 — **키 alias 도 검색 대상이다** (D-192).
    등록으로 되는 값이 검색으로 안 되면 유저는 같은 값을 두 곳에서 다르게
    대접받는다. `1460` 으로 등록이 되는데 검색이 안 되면 안 된다.

    ⚠️ **승인 전 AI 제안은 뺀다** — 매칭에 안 쓰이는 값이(FR-06-C-05) 검색에만
    나오면 "찾았는데 등록하면 다른 도감이 생긴다"가 된다.
  */
  matchKeys: {
    where: {
      kind: "ALIAS" as const,
      NOT: { source: "AI_APPROVED" as const, approvedBy: null },
    },
    select: { value: true },
  },
} as const;

/**
 * 도감 검색 (S-25 도감 탭 — 옛 S-08) — 원문 명칭·고유값·전 언어 alias 를 모두 매칭
 * (FR-06-B-01·02, D-009).
 *
 * ⚠️ **정규화는 D-014 규칙을 공유한다.** 검색·매칭·import 가 다른 규칙을 쓰면
 * 등록에서 연결된 도감이 검색으로는 안 나오는 상태가 된다.
 *
 * ⚠️ **보유자 수는 로그인 유저에게만 준다** (D-096, FR-06-B-06). 호출부가
 * 조건부 렌더로 숨기는 것이 아니라 **여기서 넣지 않는다.**
 */
export async function searchCodex(
  query: string,
  opts: { category?: string; viewer: Viewer | null; withOwnerCount: boolean },
): Promise<{ entry: CodexPublic; ownerCount?: number; matchedAlias?: string }[]> {
  const nq = normalizeBrandToken(query);
  if (!nq) return [];

  /*
    ## ⚠️ 초판은 **필터 없이 `take: 300`** 이었다 — 도감이 그보다 많으면 조용히 샌다
    정렬도 없어서 **어느 300건이 오는지 정해지지 않았다.**

    실측(2026-08-19, 로컬 947건 = 운영과 같은 규모):
    | 카테고리 | 도감 | 검색이 훑던 범위 |
    |---|---|---|
    | **옷** | **339건** | 300건 — **39건 이상이 영원히 안 걸렸다** |
    | 캠핑 | 208 | 전부 |
    | 시계 | 184 | 전부 |

    화면은 정상이고 **결과만 비어 있다** — "검색 결과가 없습니다"가 뜨므로 유저도
    운영도 검색이 새고 있다는 것을 알 방법이 없었다. 지금 호출부는 둘 다 카테고리를
    넘기지만(`codex/page.tsx` · `codex-match-key.ts` 의 계측), **카테고리 하나가
    300건을 넘는 순간** 그 카테고리에서 새기 시작한다 — 옷이 이미 넘었다.

    이제 **DB 에서 후보를 좁힌다.** 정규화 비교 자체는 DB 로 밀 수 없지만
    (`displayName` 에 정규화 컬럼이 없다) 좁히기는 가능하다:

    | 조건 | 무엇을 잡는가 |
    |---|---|
    | `normalizedKey contains` | **정규화된 부분일치** — `바벨벤치프레스` → `바벨 벤치프레스` |
    | `displayName`·`uniqueId contains` | 원문 부분일치 (대소문자 무시) |
    | `matchKeys.value contains` | 키 alias (이미 정규화된 값, D-192) |
    | `aliases` 비어 있지 않음 | **언어별 표기 alias** — Json 객체라 조건으로 밀 수 없어 후보로만 |

    ⚠️ **마지막 줄이 남은 약점이다.** alias 를 가진 도감이 상한을 넘게 늘면 그때는
    다시 샌다. 근본 해법은 정규화 컬럼 + 인덱스(또는 전문 검색)이고, 이 변경의
    범위를 넘는다 → planning 에 OI 로 남긴다.
  */
  const rows = await prisma.codexItem.findMany({
    where: {
      // 병합으로 흡수된 도감은 결과에 내지 않는다 — survivor 를 보여줘야 한다 (D-016)
      mergedIntoId: null,
      ...(opts.category ? { category: { key: opts.category } } : {}),
      OR: [
        { normalizedKey: { contains: nq } },
        { displayName: { contains: query.trim(), mode: "insensitive" } },
        { uniqueId: { contains: query.trim(), mode: "insensitive" } },
        { matchKeys: { some: { value: { contains: nq } } } },
        // 언어별 표기 alias 는 메모리에서 판정한다 (아래 랭킹) — 후보로만 넣는다
        { NOT: { aliases: { equals: {} } } },
      ],
    },
    select: CODEX_SELECT,
    orderBy: { displayName: "asc" },
    take: SEARCH_CANDIDATE_LIMIT,
  });

  // 정규화 비교는 DB 로 밀 수 없다(정규화 컬럼이 displayName 에는 없다).
  // 좁힌 후보를 애플리케이션에서 랭킹한다 — E-06-05 의 "관련도 순"
  const scored: { row: CodexRow; rank: number; alias?: string }[] = [];
  for (const row of rows) {
    const name = normalizeBrandToken(row.displayName);
    const uid = row.uniqueId ? normalizeBrandToken(row.uniqueId) : "";
    const aliases = aliasList(row.aliases);
    // ⚠️ 이미 정규화된 값이다 — 다시 정규화하지 않는다 (FR-02-A-07)
    const keyAliases = row.matchKeys?.map((k) => k.value) ?? [];

    // 랭크가 낮을수록 앞. 원문·고유값 일치가 alias 일치보다 우선 (E-06-05)
    if (name === nq || uid === nq) scored.push({ row, rank: 0 });
    // ⚠️ **키 alias 완전일치는 rank 0 급이다** (FR-06-C-08). 등록하면 이 도감에
    // 연결될 값이므로 "정확히 이것"에 해당한다 — 명칭 alias(rank 1)보다 앞이다
    else if (keyAliases.includes(nq)) scored.push({ row, rank: 0 });
    else {
      const exact = aliases.find((a) => normalizeBrandToken(a) === nq);
      if (exact) scored.push({ row, rank: 1, alias: exact });
      else if (name.startsWith(nq) || uid.startsWith(nq)) scored.push({ row, rank: 2 });
      else {
        const pre = aliases.find((a) => normalizeBrandToken(a).startsWith(nq));
        if (pre) scored.push({ row, rank: 3, alias: pre });
        else if (name.includes(nq) || uid.includes(nq)) scored.push({ row, rank: 4 });
        else {
          const part = aliases.find((a) => normalizeBrandToken(a).includes(nq));
          if (part) scored.push({ row, rank: 5, alias: part });
        }
      }
    }
  }
  scored.sort((a, b) => a.rank - b.rank || a.row.displayName.localeCompare(b.row.displayName));

  const [counts, images] = await Promise.all([
    opts.withOwnerCount
      ? ownerCounts(scored.map((s) => s.row.id), await blockedUserIds(opts.viewer))
      : Promise.resolve(new Map<string, number>()),
    codexImages(scored.map((s) => s.row.id)),
  ]);

  return scored.map((s) => ({
    entry: toPublic(s.row, images.get(s.row.id)),
    // ⚠️ 비로그인이면 **키 자체가 없다.** 0 을 넣으면 "0명 보유"가 렌더된다
    ownerCount: opts.withOwnerCount ? (counts.get(s.row.id) ?? 0) : undefined,
    matchedAlias: s.alias,
  }));
}

/**
 * 검색 후보 상한.
 *
 * ⚠️ **필터를 거친 뒤의 상한**이다. 초판은 필터 없이 300 이어서 옷 카테고리
 * 339건 중 39건 이상이 검색에서 조용히 빠졌다 (위 주석 참조). 지금은 `OR` 조건이
 * 후보를 좁히고, 그 뒤로 넉넉히 잡는다 — 운영 도감 전체(944건)를 담고도 남는다.
 */
const SEARCH_CANDIDATE_LIMIT = 2000;

/** 도감 탭 브라우즈 상한 (D-160). 넘치면 개수를 함께 보여 절단을 숨기지 않는다 */
export const CODEX_BROWSE_LIMIT = 60;

/**
 * 도감 목록 브라우즈 (S-25, D-160).
 *
 * ## ⚠️ `searchCodex("")` 로는 안 된다
 * 그 함수는 빈 검색어에 **빈 배열**을 낸다(정규화 결과가 비면 즉시 반환).
 * 검색과 브라우즈는 다른 동작이므로 함수를 따로 둔다.
 *
 * ## 정렬은 **최근 추가순**이다
 * 사전순은 첫 화면이 늘 같아 죽어 보이고, **보유자 수 순은 쓸 수 없다** —
 * 보유자 수는 로그인 유저에게만 주는 값이라(D-096) 정렬에 쓰면 비로그인
 * 화면의 순서로 그 크기가 드러난다.
 *
 * ## ⚠️ 전체 열람이 목적이 아니다
 * 도감은 수천 건까지 늘 수 있고 페이징이 없다. **찾는 수단은 검색**이고
 * 브라우즈는 "무엇이 있는지 감을 준다"까지다 — 상한과 전체 개수를 함께 낸다
 * (OI-80).
 */
export async function listCodex(opts: {
  category?: string;
  viewer: Viewer | null;
  withOwnerCount: boolean;
}): Promise<{
  total: number;
  hits: { entry: CodexPublic; ownerCount?: number }[];
}> {
  const where = {
    // 병합으로 흡수된 도감은 내지 않는다 — survivor 를 보여줘야 한다 (D-016)
    mergedIntoId: null,
    ...(opts.category ? { category: { key: opts.category } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.codexItem.count({ where }),
    prisma.codexItem.findMany({
      where,
      select: CODEX_SELECT,
      /*
        D-285 — **유명 브랜드가 먼저**. `displayOrder` 는 `Brand.displayOrder`
        를 복사한 값이다 (도감에는 브랜드 링크가 없다).

        ⚠️ **`desc` 인 것이 의도다.** 초판은 "낮을수록 앞" 이라 `asc` 였는데
        기본값 0 이 가장 작아 **맨 앞**에 왔다 — 우선순위가 정반대로 동작했다
        (실측으로 확인). `NULLS LAST` 는 NULL 에만 듣고 0 에는 안 듣는다.
        방향을 뒤집으니 **0 = 지정 안 됨이 자연히 맨 뒤**가 되고 raw 쿼리도
        필요 없어졌다.

        같은 우선순위 안에서는 **최근 추가순** — 원래 기준을 유지한다
      */
      orderBy: [{ displayOrder: "desc" }, { createdAt: "desc" }],
      take: CODEX_BROWSE_LIMIT,
    }),
  ]);

  const [counts, images] = await Promise.all([
    opts.withOwnerCount
      ? ownerCounts(rows.map((r) => r.id), await blockedUserIds(opts.viewer))
      : Promise.resolve(new Map<string, number>()),
    codexImages(rows.map((r) => r.id)),
  ]);

  return {
    total,
    hits: rows.map((row) => ({
      entry: toPublic(row, images.get(row.id)),
      // ⚠️ 비로그인이면 **키 자체가 없다.** 0 을 넣으면 "0명 보유"가 렌더된다
      ownerCount: opts.withOwnerCount ? (counts.get(row.id) ?? 0) : undefined,
    })),
  };
}

/**
 * 도감 상세의 제품 정보 — **서버·ISR 경로.**
 *
 * ⚠️ 뷰어를 받지 않는다. 받으면 쿠키를 읽게 되어 정적 생성이 깨지고,
 * 무엇보다 **보유자 수를 여기서 계산할 길이 열린다** (D-078).
 */
export async function getCodexPublic(codexId: string): Promise<CodexPublic | null> {
  const c = await prisma.codexItem.findUnique({
    where: { id: codexId },
    select: CODEX_SELECT,
  });
  if (!c) return null;
  const images = await codexImages([c.id]);
  return toPublic(c, images.get(c.id));
}

/** 보유자 수 — 로그인 유저에게만. 인증된 경로에서만 호출한다 (D-096) */
export async function getOwnerCount(
  codexId: string,
  viewer: Viewer | null,
): Promise<number> {
  const counts = await ownerCounts([codexId], await blockedUserIds(viewer));
  return counts.get(codexId) ?? 0;
}

/** ISR 사전 생성 대상 (generateStaticParams) — 병합된 것은 제외 */
export async function allCodexIds(): Promise<string[]> {
  const rows = await prisma.codexItem.findMany({
    where: { mergedIntoId: null },
    select: { id: true },
    take: 1000,
  });
  return rows.map((r) => r.id);
}

/** 병합된 도감으로 들어오면 살아남은 쪽으로 보낸다 (D-016, FR-05-B-05) */
export async function resolveMergedCodex(codexId: string): Promise<string | null> {
  const c = await prisma.codexItem.findUnique({
    where: { id: codexId },
    select: { mergedIntoId: true },
  });
  return c?.mergedIntoId ?? null;
}

/**
 * 도감 속성값 (E-07-06).
 *
 * 도감 자체에는 속성 테이블이 없다 — 연결된 아이템의 매칭 키 속성으로 만든다.
 * 값이 비면 렌더하지 않는다.
 */
export async function getCodexAttrs(
  codexId: string,
  locale: Locale,
): Promise<CodexAttr[]> {
  const c = await prisma.codexItem.findUnique({
    where: { id: codexId },
    select: {
      uniqueId: true,
      category: {
        select: { key: true, matchingKey: { select: { attributeKeys: true } } },
      },
    },
  });
  if (!c) return [];

  const attrs: CodexAttr[] = [];
  // ⚠️ 라벨을 DB 에서 읽는다 (D-135) — 메시지 파일의 `attr.*` 키는 어드민이
  // 추가한 속성을 덮지 못하고, 실제로 4종이 어긋나 화면이 터졌다
  const labels = await prisma.attributeDefinition.findMany({
    where: { key: { in: ["uniqueId", "brand"] } },
    select: { key: true, labelKo: true, labelJa: true, labelEn: true },
  });
  const labelOf = (key: string) => {
    const d = labels.find((l) => l.key === key);
    return d ? pickAttrLabel(locale, d) : key;
  };

  if (c.uniqueId) {
    attrs.push({ key: "uniqueId", label: labelOf("uniqueId"), value: c.uniqueId });
  }

  // 연결된 아이템 중 아무거나 하나에서 브랜드를 가져온다 — 같은 도감이면
  // 브랜드는 같다 (D-013 매칭 키에 브랜드가 포함되기 때문)
  const sample = await prisma.item.findFirst({
    where: { codexItemId: codexId, brandId: { not: null } },
    select: { brand: { select: { name: true } } },
  });
  if (sample?.brand) {
    attrs.unshift({ key: "brand", label: labelOf("brand"), value: sample.brand.name });
  }
  return attrs;
}

/**
 * 운동 도감의 분류·영상 (D-227, `FR-11-C-02`).
 *
 * ## ⚠️ 왜 `getCodexAttrs` 안에 넣지 않았나
 * 그 함수는 **매칭 키에서 파생되는 값**(고유값·브랜드)을 만든다. 운동은 매칭 키가
 * 없고(`FR-10-A-02`) 값의 출처가 **`Exercise` 컬럼**이다 — 성격이 다르다.
 * 한 함수에 넣으면 "매칭 키에서 온 값"과 "마스터 컬럼에서 온 값"이 섞여, 나중에
 * 매칭 키 규칙을 고칠 때 운동까지 함께 흔들린다.
 *
 * ⚠️ **라벨과 선택지 라벨을 모두 DB 에서 읽는다** (D-135·D-227). 메시지 파일에
 * 박으면 어드민이 A-02·A-04 에서 이름을 바꿨을 때 같은 값이 화면마다 다르게
 * 불린다.
 *
 * @returns 운동이 아니면 `null` — 호출부가 섹션 자체를 렌더하지 않는다
 */
export async function getExerciseDetail(
  codexId: string,
  locale: Locale,
): Promise<{
  attrs: CodexAttr[];
  /** 근육맵 입력. 표시 순서는 `AttributeOption.displayOrder` (`FR-10-D-03`) */
  muscles: string[];
  /** 폼 시연 영상. 외부 링크 경고를 거쳐야 한다 (D-040) */
  referenceUrl?: string;
  /** 어드민이 내린 운동인가 — 목록에서는 빠지지만 상세는 열린다 (`FR-11-C-07`) */
  inactive: boolean;
} | null> {
  const ex = await prisma.exercise.findUnique({
    where: { codexItemId: codexId },
    select: {
      targetMuscles: true,
      equipmentType: true,
      mechanic: true,
      forceType: true,
      referenceUrl: true,
      active: true,
    },
  });
  if (!ex) return null;

  const keys = ["targetMuscle", "equipmentType", "mechanic", "forceType"] as const;
  const defs = await prisma.attributeDefinition.findMany({
    where: { key: { in: [...keys] } },
    select: {
      key: true,
      labelKo: true,
      labelJa: true,
      labelEn: true,
      options: {
        select: { key: true, labelKo: true, labelJa: true, labelEn: true, displayOrder: true },
      },
    },
  });
  const defOf = (key: string) => defs.find((d) => d.key === key);
  const optLabel = (attr: string, value: string) => {
    const o = defOf(attr)?.options.find((x) => x.key === value);
    // 선택지에 없는 값이면 **키를 그대로 낸다** — 빈칸이면 무엇인지 알 수 없다 (D-174)
    return o ? pickAttrLabel(locale, { key: o.key, labelKo: o.labelKo, labelJa: o.labelJa, labelEn: o.labelEn }) : value;
  };

  const attrs: CodexAttr[] = [];
  const single = (attr: string, value: string | null) => {
    const d = defOf(attr);
    if (!value || !d) return;
    attrs.push({ key: attr, label: pickAttrLabel(locale, d), value: optLabel(attr, value) });
  };

  const muscleDef = defOf("targetMuscle");
  if (ex.targetMuscles.length > 0 && muscleDef) {
    const order = new Map(muscleDef.options.map((o) => [o.key, o.displayOrder]));
    const sorted = [...new Set(ex.targetMuscles)].sort(
      (a, b) =>
        (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER),
    );
    attrs.push({
      key: "targetMuscle",
      label: pickAttrLabel(locale, muscleDef),
      value: sorted.map((m) => optLabel("targetMuscle", m)).join(", "),
    });
  }
  single("equipmentType", ex.equipmentType);
  single("mechanic", ex.mechanic);
  single("forceType", ex.forceType);

  const muscleOrderMap = new Map(
    (muscleDef?.options ?? []).map((o) => [o.key, o.displayOrder]),
  );
  return {
    attrs,
    muscles: [...new Set(ex.targetMuscles)].sort(
      (a, b) =>
        (muscleOrderMap.get(a) ?? Number.MAX_SAFE_INTEGER) -
        (muscleOrderMap.get(b) ?? Number.MAX_SAFE_INTEGER),
    ),
    referenceUrl: ex.referenceUrl ?? undefined,
    inactive: !ex.active,
  };
}

/**
 * 도감 설명 (FR-07-A-05).
 *
 * | 검증 상태 | 설명 |
 * |---|---|
 * | **검증됨** | 어드민이 쓴 ko/ja/en. 폴백 `요청 언어 → en → ko` (D-012) |
 * | **미검증** | 유저 입력 원문 1개. **번역하지 않는다** |
 *
 * ⚠️ 미검증본을 번역하면 운영자가 검수하지 않은 내용을 서비스가 보증하는 것처럼
 * 보인다. 그래서 원문 그대로 둔다 (`policies/i18n` Case 1).
 */
export async function getCodexDesc(
  codexId: string,
  locale: "ko" | "ja" | "en",
): Promise<{ text: string; translated: boolean } | null> {
  const c = await prisma.codexItem.findUnique({
    where: { id: codexId },
    select: { verification: true, description: true, descriptions: true },
  });
  if (!c) return null;

  if (c.verification === "VERIFIED" && c.descriptions) {
    const d = c.descriptions as Record<string, unknown>;
    const pick = [locale, "en", "ko"]
      .map((k) => d[k])
      .find((v): v is string => typeof v === "string" && v.trim() !== "");
    if (pick) return { text: pick, translated: true };
  }
  // 미검증이거나 검증본에 언어가 하나도 없으면 원문
  return c.description ? { text: c.description, translated: false } : null;
}


/**
 * 이 도감의 판매중 매물 (FR-07-A-04).
 *
 * ⚠️ **비로그인·크롤러에게도 서버 렌더한다** (D-098, FR-07-A-09). 소유자
 * 목록과 달리 판매자는 **스스로 매물로 올렸고**, 그 매물은 마켓에서 이미
 * 색인된다. 판매완료는 빠진다 (FR-07-B-10).
 */
export async function getCodexListings(codexId: string): Promise<MarketListing[]> {
  const rows = await prisma.item.findMany({
    where: {
      codexItemId: codexId,
      saleStatus: "ON_SALE",
      visibility: "PUBLIC",
      // 비로그인도 보는 경로다 — 차단 필터를 걸지 않는다 (전역 캐시 가능)
      room: { visibility: "PUBLIC", user: { deletedAt: null } },
    },
    select: {
      id: true,
      price: true,
      currency: true,
      category: { select: { key: true } },
      room: { select: { id: true, name: true } },
      photos: { select: { url: true }, orderBy: { displayOrder: "asc" }, take: 1 },
      ...NAME_SELECT,
    },
    orderBy: [{ onSaleAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });

  return rows.flatMap((r) =>
    r.price === null || r.currency === null
      ? []
      : [
          {
            id: r.id,
            name: deriveItemName(r),
            categoryKey: `category.${r.category.key}`,
            roomId: r.room.id,
            roomName: r.room.name,
            price: Number(r.price),
            currency: r.currency,
            photoUrl: realPhotoUrl(r.photos[0]?.url),
          },
        ],
  );
}
