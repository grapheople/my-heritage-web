import type { Prisma } from "@/generated/prisma/client";
import { searchCodex } from "@/lib/data/codex";
import { prisma } from "@/lib/prisma";
import { scopeIdOf } from "@/lib/scope";

/**
 * 도감 매칭 인덱스 (D-197) · 매칭 계측 (D-198).
 *
 * ## ⚠️ 왜 테이블을 따로 뒀는가
 * `alias` 가 **등록 매칭에 전혀 쓰이지 않고 있었다** — 검색은 명칭·고유값·3개
 * 언어 alias 를 부분일치로 보는데(FR-06-B-01) 등록 매칭은 `normalizedKey`
 * 완전일치 하나뿐이었다. alias 를 900건 넣어도 히트율이 그대로였다 (D-191·D-192).
 *
 * ## ⚠️ 왜 정식 값(PRIMARY)까지 같은 테이블에 넣는가
 * `FR-02-B-06` 의 유일성 범위가 **`normalizedKey` ∪ 키 alias** 라 두 테이블에
 * 걸치면 **DB 제약을 걸 수 없다.** 애플리케이션에서 미리 세는 방식은 경합에
 * 뚫린다 — `FR-03-B-05` 가 이미 같은 이유로 유니크 제약에 의존한다.
 *
 * 부수 효과로 **①② 조회가 한 쿼리**가 되고, `kind` ASC 정렬이
 * `AC-02-B-05-2`(정식 값 우선)를 **애플리케이션 분기 없이** 보장한다.
 */

/** `resolveCodexByKey` 가 어떤 경로로 찾았는가. 호출부의 표시·집계가 이 값을 쓴다 */
export type MatchVia = "exact" | "keyAlias" | "created";

export type MatchKeyHit = {
  codexItemId: string;
  /** `keyAlias` 면 FR-03-E-03 근거 표시가 필요하다 */
  via: Extract<MatchVia, "exact" | "keyAlias">;
};

/**
 * 매칭 파이프라인 ①② (FR-02-B-01·FR-02-B-05).
 *
 * ⚠️ **순서가 규칙이다.** `kind` ASC 로 PRIMARY 가 먼저다 — 뒤집으면 정식 값으로
 * 등록한 유저가 동의어 쪽 도감으로 끌려간다 (AC-02-B-05-2).
 *
 * ⚠️ **승인 게이트는 `AI_APPROVED` 에만 건다** (FR-06-C-05). 명칭 alias 는 틀려도
 * 검색이 넓어질 뿐이지만 **키 alias 가 틀리면 아이템이 엉뚱한 도감에 붙는다** —
 * 그래서 AI 제안분은 승인 전까지 매칭에서 뺀다.
 *
 * 다만 `MERGE`·`ADMIN` 은 **어드민 행동 자체가 승인**이므로 `approvedBy` 가 없다.
 * 게이트를 `kind` 로 걸면(= 모든 ALIAS 에 승인을 요구하면) **병합으로 축적한 키
 * alias 가 통째로 매칭되지 않는다** — FR-05-B-09 가 무력화된다.
 *
 * ⚠️ **흡수된 도감은 반환하지 않는다** (FR-02-B-08) — survivor 를 써야 한다.
 */
export async function resolveCodexByKey(input: {
  categoryId: string;
  /** D-253 — 종류가 있는 카테고리면 채운다. 매칭 범위가 이 축으로 갈린다 */
  subtypeId?: string | null;
  normalizedKey: string;
}): Promise<MatchKeyHit | null> {
  const hit = await prisma.codexMatchKey.findFirst({
    where: {
      // D-254 — 카테고리가 아니라 **스코프**로 찾는다. 휠셋 도감과 완성차
      // 도감은 같은 카테고리에 있어도 서로 만나지 않아야 한다
      scopeId: scopeIdOf(input),
      value: input.normalizedKey,
      codexItem: { mergedIntoId: null },
      // 승인 대기 중인 AI 제안만 제외한다 (FR-06-C-05)
      NOT: { source: "AI_APPROVED", approvedBy: null },
    },
    orderBy: { kind: "asc" }, // PRIMARY < ALIAS (enum 선언 순서)
    select: { codexItemId: true, kind: true },
  });
  if (!hit) return null;
  return {
    codexItemId: hit.codexItemId,
    via: hit.kind === "PRIMARY" ? "exact" : "keyAlias",
  };
}

type Tx = Prisma.TransactionClient;

/**
 * 도감의 정식 값을 매칭 인덱스에 반영한다 (D-197).
 *
 * ⚠️ **도감을 만드는 모든 경로가 이것을 불러야 한다.** 안 부르면 그 도감은
 * `CodexItem` 에는 있는데 **매칭으로는 영원히 닿지 않는다** — 보유자만 0명인
 * 도감이 생기는 D-185·D-186 과 같은 실패 모양이다.
 *
 * `@@unique([scopeId, value])` 가 있으므로 이미 있으면 조용히 넘어간다.
 * 다른 도감이 그 값을 선점했으면 던진다 — 호출부가 FR-02-B-07 로 안내한다.
 */
export async function syncPrimaryMatchKey(
  tx: Tx,
  input: {
    codexItemId: string;
    categoryId: string;
    /** ⚠️ 도감의 `subtypeId` 와 **반드시 같아야 한다** — 다르면 도감과 매칭 키의 scope 가 갈린다 */
    subtypeId?: string | null;
    normalizedKey: string;
  },
): Promise<void> {
  await tx.codexMatchKey.upsert({
    where: {
      scopeId_value: { scopeId: scopeIdOf(input), value: input.normalizedKey },
    },
    // 이미 같은 도감의 PRIMARY 면 할 일이 없다. 다른 도감 것이면 update 가
    // 소유를 옮겨버리므로 **일치할 때만** 통과시킨다
    update: {},
    create: {
      categoryId: input.categoryId,
      // scopeId 는 쓰지 않는다 — DB 가 이 둘로 계산한다
      subtypeId: input.subtypeId ?? null,
      codexItemId: input.codexItemId,
      value: input.normalizedKey,
      kind: "PRIMARY",
      source: "SYSTEM",
    },
  });
}

/** `logCodexMatch` 의 `via` → 저장되는 `outcome` */
const OUTCOME = {
  exact: "EXACT",
  keyAlias: "KEY_ALIAS",
  created: "CREATED",
} as const;

/**
 * 매칭 계측 (FR-03-E-06·07·08·09, D-198).
 *
 * ## ⚠️ 무엇을 판별하려는 것인가 (H11)
 * `outcome` 만 세면 미스 원인이 **단위 차이**(도감은 있는데 키가 안 맞음 →
 * 키 alias 가 답)인지 **도감 부재**(→ 시딩량이 답)인지 구분되지 않는다.
 * 답에 따라 다음에 할 일이 완전히 달라진다.
 *
 * 판별자는 이미 있다 — **검색이다.** 검색은 부분일치이므로(FR-06-B-01)
 * **같은 값으로 검색하면 나오는데 등록은 미스** = 단위 차이(OI-97 유형)다.
 *
 * ⚠️ **`searchCodex` 를 재사용한다.** 여기서 판정 규칙을 새로 쓰면 "검색으로
 * 찾히는가"라는 질문의 기준이 검색과 갈린다 — D-190 이 브랜드 게이트만 자체
 * 규칙(완전일치)을 들고 있어서 겪은 실패와 같은 모양이다.
 *
 * ⚠️ **호출부는 아이템 저장이 끝난 뒤에 부른다** (FR-03-E-08). 이 함수는
 * 스스로 던지지 않는다 — 계측 장애가 등록을 막으면 안 된다.
 *
 * ⚠️ **userId·itemId 를 받지 않는다** (FR-03-E-09). 집계가 목적이고 후보 큐에는
 * `topHitCodexId` 면 충분하다 — 용도가 없는 수집은 하지 않는다.
 */
export async function logCodexMatch(input: {
  categoryId: string;
  /** 카테고리 `key`. 미스일 때 검색 범위를 좁히는 데만 쓴다 */
  categoryKey: string;
  brandId: string | null;
  /** 정규화된 시도값 */
  attempted: string;
  via: MatchVia;
}): Promise<void> {
  try {
    let searchHits: number | null = null;
    let topHitCodexId: string | null = null;

    // ⚠️ **미스일 때만 검색을 돈다** — 히트율이 오를수록 비용이 준다
    if (input.via === "created") {
      const hits = await searchCodex(input.attempted, {
        category: input.categoryKey,
        viewer: null,
        withOwnerCount: false,
      });
      searchHits = hits.length;
      topHitCodexId = hits[0]?.entry.id ?? null;
    }

    await prisma.codexMatchLog.create({
      data: {
        categoryId: input.categoryId,
        brandId: input.brandId,
        attempted: input.attempted,
        outcome: OUTCOME[input.via],
        searchHits,
        topHitCodexId,
      },
    });
  } catch (e) {
    // 계측은 본 작업이 아니다. 삼키되 조용히 사라지지는 않게 남긴다
    console.error("[codex-match-log] 기록 실패", e);
  }
}
