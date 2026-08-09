import type { CodexAttr, CodexEntry, CodexOwner, MarketListing } from "@/lib/data/types";
import type { Viewer } from "@/lib/auth/viewer";
import { normalizeBrandToken } from "@/lib/brand-search";
import { blockedUserIds, publicRoomWhere } from "@/lib/data/scope";
import { levelOf } from "@/lib/data/level";
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
};

function aliasList(aliases: unknown): string[] {
  if (!aliases || typeof aliases !== "object") return [];
  const a = aliases as Record<string, unknown>;
  return (["ko", "ja", "en"] as const).flatMap((k) =>
    Array.isArray(a[k]) ? (a[k] as unknown[]).filter((v): v is string => typeof v === "string") : [],
  );
}

/**
 * 보유자 수 (FR-07-A-02).
 *
 * ⚠️ **사람 단위다** — 한 유저가 같은 도감의 아이템을 2개 이상 가져도 1로 센다
 * (E-07-01). 그래서 아이템이 아니라 **방을 distinct** 로 센다.
 *
 * ⚠️ **조회 유저마다 값이 다르다** (E-07-07, D-051) — 차단 관계가 빠지기
 * 때문이다. 그래서 전역 캐시에 올릴 수 없다 (FR-07-B-09).
 */
async function ownerCounts(
  codexIds: string[],
  blockedIds: string[],
): Promise<Map<string, number>> {
  if (codexIds.length === 0) return new Map();
  const rows = await prisma.item.findMany({
    where: { codexItemId: { in: codexIds }, ...ownerItemWhere(blockedIds) },
    select: { codexItemId: true, roomId: true },
  });
  const byCodex = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.codexItemId) continue;
    const set = byCodex.get(r.codexItemId) ?? new Set<string>();
    set.add(r.roomId);
    byCodex.set(r.codexItemId, set);
  }
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
} as const;

/**
 * 도감 검색 (S-08 도감 탭) — 원문 명칭·고유값·전 언어 alias 를 모두 매칭
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

  const rows = await prisma.codexItem.findMany({
    where: {
      // 병합으로 흡수된 도감은 결과에 내지 않는다 — survivor 를 보여줘야 한다 (D-016)
      mergedIntoId: null,
      ...(opts.category ? { category: { key: opts.category } } : {}),
    },
    select: CODEX_SELECT,
    take: 300,
  });

  // 정규화 비교는 DB 로 밀 수 없다(정규화 컬럼이 displayName 에는 없다).
  // 후보를 좁힌 뒤 애플리케이션에서 랭킹한다 — E-06-05 의 "관련도 순"
  const scored: { row: CodexRow; rank: number; alias?: string }[] = [];
  for (const row of rows) {
    const name = normalizeBrandToken(row.displayName);
    const uid = row.uniqueId ? normalizeBrandToken(row.uniqueId) : "";
    const aliases = aliasList(row.aliases);

    // 랭크가 낮을수록 앞. 원문·고유값 일치가 alias 일치보다 우선 (E-06-05)
    if (name === nq || uid === nq) scored.push({ row, rank: 0 });
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
 * 도감 소유자 목록 — ⚠️ **서버 렌더 결과에 넣지 않는다** (D-078, FR-07-A-08).
 * 이 함수는 인증된 API route 에서만 호출한다.
 */
export async function getCodexOwners(
  codexId: string,
  viewer: Viewer | null,
): Promise<CodexOwner[]> {
  const blockedIds = await blockedUserIds(viewer);
  const items = await prisma.item.findMany({
    where: { codexItemId: codexId, ...ownerItemWhere(blockedIds) },
    select: { room: { select: { id: true, name: true, userId: true } } },
  });

  // 사람 단위로 접는다 (E-07-01)
  const rooms = new Map<string, { id: string; name: string; userId: string }>();
  for (const i of items) rooms.set(i.room.id, i.room);

  return Promise.all(
    [...rooms.values()].map(async (r) => ({
      roomId: r.id,
      roomName: r.name,
      level: await levelOf(r.userId),
    })),
  );
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
