import { resolveMasterBrand } from "@/lib/brand-master";
import { buildMatchingKey, uniqueIdForCodex } from "@/lib/codex-key";
import { syncPrimaryMatchKey } from "@/lib/codex-match-key";
import { prisma } from "@/lib/prisma";
import { scopeIdOf } from "@/lib/scope";

/**
 * 도감 1건을 만든다 — **어드민 직접 등록과 자료 조사 등록이 같은 함수를 쓴다.**
 *
 * ## ⚠️ 왜 액션 밖으로 빼는가
 * `createCodexItem`(사람이 손으로 입력) 과 `createCodexItemsFromResearch`(로컬 AI
 * 조사 결과) 가 **각자 키를 만들면 조용히 갈린다.** 매칭 키 생성 규칙이
 * 어긋나도 도감은 멀쩡히 만들어지고 **보유자만 영원히 0명**이라 알아채기
 * 어렵다 — `createCodexItem` 이 유저 등록과 같은 `buildMatchingKey` 를 쓰는
 * 이유가 그것이다. 경로가 하나 더 생겼으니 규칙도 한 곳에 둔다.
 *
 * ## ⚠️ `"use server"` 파일이 아니다 — 의도된 것이다
 * `verification` 을 인자로 받는다. 이것이 Server Action 이면 **클라이언트가
 * `verification: "VERIFIED"` 로 직접 호출**할 수 있고, 그러면 검증 배지가
 * 무의미해진다 (D-033 — 배지는 신뢰 신호다). 액션은 호출부에서 인가를 마친 뒤
 * 이 함수를 부른다.
 */
export type InsertCodexResult =
  | { ok: true; codexId: string }
  /** `field` 는 실제 존재하는 입력칸 키 — 없는 칸에 붙이면 화면에 뜨지 않는다 */
  | { ok: false; error: string; field?: string };

export async function insertCodex(input: {
  categoryKey: string;
  displayName: string;
  keyValues: Record<string, string>;
  /**
   * D-253 — 종류가 있는 카테고리면 채운다. **도감의 이름 공간이 이 축으로 갈린다.**
   * 비우면 카테고리 스코프가 되고, 그것이 종류 없는 카테고리의 정상 상태다.
   */
  subtypeId?: string | null;
  descriptions?: { ko?: string; ja?: string; en?: string };
  /**
   * ⚠️ **호출부가 정한다 — 출처에 따라 갈린다.** 사람이 확인해서 넣었으면
   * `VERIFIED`(FR-04-A-02), AI 조사분이면 `UNVERIFIED`(A-05 검수 대기).
   */
  verification: "VERIFIED" | "UNVERIFIED";
  /** `VERIFIED` 일 때 검증자로 기록되는 `AdminUser.id` */
  actorId: string;
}): Promise<InsertCodexResult> {
  const displayName = input.displayName.trim();
  if (!displayName) return { ok: false, error: "명칭을 입력해주세요", field: "displayName" };

  /*
    ⚠️ **미검증 도감에 다국어 설명을 넣지 않는다** (FR-07-A-05). 미검증본의
    설명은 유저가 쓴 원문 그대로여야 한다 — 운영이 넣은 문장이 그 자리에 들어가면
    유저가 쓴 것으로 읽힌다. 조용히 버리지 않고 막는다(호출부의 버그다).
  */
  if (input.verification === "UNVERIFIED" && input.descriptions) {
    return { ok: false, error: "미검증 도감에는 설명을 넣을 수 없습니다 (FR-07-A-05)" };
  }

  const category = await prisma.category.findUnique({
    where: { key: input.categoryKey },
    select: { id: true, matchingKey: { select: { attributeKeys: true } } },
  });
  if (!category) return { ok: false, error: "카테고리를 찾을 수 없습니다" };
  // 브랜드 게이트가 키로 조회하므로 id → key 로 한 번 푼다
  const subtypeKey = input.subtypeId
    ? (
        await prisma.categorySubtype.findUnique({
          where: { id: input.subtypeId },
          select: { key: true },
        })
      )?.key
    : undefined;

  const keyOrder = category.matchingKey?.attributeKeys ?? [];
  if (keyOrder.length === 0) {
    // A-03 미구성. 여기서 임의로 `uniqueId` 를 가정하면 나중에 운영이 실제
    // 매칭 키를 정하는 순간 이 도감만 다른 규칙으로 남는다
    return { ok: false, error: "이 카테고리의 매칭 키가 아직 구성되지 않았습니다 (A-03)" };
  }

  /*
    ⚠️ **브랜드가 매칭 키면 브랜드 마스터를 통과해야 한다** (D-043·D-044).
    이유는 `lib/brand-master.ts` 에 적었다 — 자유 텍스트 브랜드는 어떤 유저
    아이템과도 만나지 않는 도감을 만든다. AI 조사가 브랜드를 지어 쓸 수 있으므로
    (`brand` 가 자전거·옷·캠핑·데스크테리어의 키 구성이다) 여기서 막는다.

    비어 있는 것은 막지 않는다 — 브랜드 마스터 등록 대기 상태를 허용한다 (D-046).
  */
  const keyValues = { ...input.keyValues };
  const brandName = keyValues.brand?.trim();
  if (keyOrder.includes("brand") && brandName) {
    /*
      ⚠️ **종류를 함께 넘긴다** (D-263). 브랜드 연결은 포함적 scope 라
      (D-255) 종류 전용 연결이 따로 있다 — Shimano 는 자전거 **공통**이
      아니라 `구동계·브레이크·휠셋` 종류에만 붙어 있다.

      안 넘기면 카테고리 공통만 보고 **"이 카테고리에 연결되지 않았습니다"**
      로 거부한다. 실제로 그래서 Dura-Ace R9200 이 전부 막혔다.
    */
    const resolved = await resolveMasterBrand(brandName, input.categoryKey, subtypeKey);
    if (!resolved.ok) return { ok: false, error: resolved.error, field: "brand" };
    keyValues.brand = resolved.name;
  }

  // 유저 등록과 **같은 함수**를 쓴다 — 규칙이 갈리면 조용히 안 만나기 시작한다
  const key = buildMatchingKey(keyOrder, keyValues);
  if (!key) {
    // 매칭 키 값이 없으면 어떤 아이템에도 연결되지 않는다 (FR-04-A-04)
    return { ok: false, error: "매칭 키 값을 입력해주세요", field: keyOrder[0] };
  }

  const scopeId = scopeIdOf({ categoryId: category.id, subtypeId: input.subtypeId });


  const dup = await prisma.codexItem.findFirst({
    where: { scopeId, normalizedKey: key.normalizedKey },
    select: { id: true, displayName: true },
  });
  // 차단하고 **기존 도감을 알려준다** — 그냥 막으면 어드민이 왜 막혔는지 모른다
  if (dup) {
    return {
      ok: false,
      error: `이미 있는 도감입니다 — "${dup.displayName}"`,
      field: keyOrder[0],
    };
  }

  /*
    ⚠️ **키 alias 가 그 값을 선점했을 수 있다** (FR-02-B-07, D-192). 유일성 범위는
    `normalizedKey` ∪ 키 alias 이므로 위의 `dup` 검사만으로는 부족하다.
    고르지 않고 실패시킨다 — 하나를 골라 넣으면 잘못된 도감이 조용히 커진다 (D-190).
  */
  const taken = await prisma.codexMatchKey.findUnique({
    where: {
      scopeId_value: { scopeId, value: key.normalizedKey },
    },
    select: { kind: true, codexItem: { select: { displayName: true } } },
  });
  if (taken) {
    return {
      ok: false,
      error:
        taken.kind === "ALIAS"
          ? `다른 도감의 키 alias 로 쓰이는 값입니다 — "${taken.codexItem.displayName}"`
          : `이미 있는 도감입니다 — "${taken.codexItem.displayName}"`,
      field: keyOrder[0],
    };
  }

  const verified = input.verification === "VERIFIED";
  /*
    ⚠️ **도감과 매칭 인덱스를 한 트랜잭션에서 만든다** (D-197). PRIMARY 행을
    빠뜨리면 `CodexItem` 에는 있는데 **매칭으로는 영원히 닿지 않는 도감**이
    된다 — 보유자만 0명인 도감이 생기는 D-185·D-186 과 같은 실패 모양이다.
  */
  const codexId = await prisma.$transaction(async (tx) => {
    const made = await tx.codexItem.create({
      data: {
        categoryId: category.id,
        // scopeId 는 쓰지 않는다 — DB 가 이 둘로 계산한다 (D-254)
        subtypeId: input.subtypeId ?? null,
        displayName,
        uniqueId: uniqueIdForCodex(keyOrder, key.raw),
        normalizedKey: key.normalizedKey,
        verification: input.verification,
        // ⚠️ 미검증본에는 검증자·일시를 남기지 않는다 — 남으면 A-05 에서
        // "누가 검증했는데 왜 미검증인가"로 읽힌다 (FR-04-B-03·04 의 역방향)
        verifiedBy: verified ? input.actorId : null,
        verifiedAt: verified ? new Date() : null,
        descriptions: input.descriptions
          ? Object.fromEntries(
              Object.entries(input.descriptions).filter(([, v]) => v?.trim()),
            )
          : undefined,
      },
      select: { id: true },
    });
    await syncPrimaryMatchKey(tx, {
      codexItemId: made.id,
      categoryId: category.id,
      // ⚠️ 도감과 **같은 값**이어야 한다 — 갈리면 만든 도감을 매칭이 못 찾는다
      subtypeId: input.subtypeId ?? null,
      normalizedKey: key.normalizedKey,
    });
    return made.id;
  });

  return { ok: true, codexId };
}
