"use server";

import { revalidatePath } from "next/cache";
import { getViewer, type Viewer } from "@/lib/auth/viewer";
import { fail, grantExperience, ownItem, type ActionResult } from "@/lib/actions/shared";
import { normalizeBrandToken } from "@/lib/brand-search";
import { prisma } from "@/lib/prisma";

/**
 * 아이템 등록 (S-04, item-catalog F-05).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 초기 상태 = **공개 · 전시중** | FR-05-A-04, D-019 |
 * | 필수 속성 미입력 시 저장 차단 + 미입력 항목 반환 | FR-05-A-03 |
 * | 사진 1~10장, **1장 필수** | D-037, FR-07-A-02·03 |
 * | 첫 사진이 대표 이미지 | FR-07-A-04 |
 * | **그날 첫 등록만** 경험치 30 | D-026, FR-01-A-02·04 |
 * | 1일 경계는 **유저 타임존** | D-056, FR-01-B-01 |
 * | 매칭 키로 도감 조회 후 연결 | D-013, FR-03-A-01 |
 * | **매칭 실패 시 미검증 도감 자동 생성** | D-015, FR-03-B-01 |
 * | 아이템 명칭은 **저장하지 않는다** | D-073, FR-06-A-11 |
 * | 이탈 시 임시 저장 없음 | FR-05-A-07 — 그래서 draft 개념이 없다 |
 */
export type CreateItemInput = {
  category: string;
  /** 속성 key → 값. `multiselect` 는 세미콜론 구분 문자열 */
  values: Record<string, string>;
  photoCount: number;
  /** "고유값을 모르겠어요" — 매칭 키 필수를 면제한다 (D-032, FR-01-A-02b) */
  unknownMatchingKey: boolean;
};

export type CreateItemResult =
  | {
      ok: true;
      itemId: string;
      expGranted: boolean;
      codexLinked: boolean;
      /** 도감이 새로 만들어졌는가 — 유저에게 알린다 (FR-03-B-03) */
      codexCreated: boolean;
    }
  | { ok: false; fieldErrors: Record<string, string>; formError?: string };

const MAX_PHOTOS = 10;
/** 아이템 등록 경험치 (D-026) */
const EXP_ITEM = 30;

/**
 * Server Action 진입점. 뷰어를 세션에서 얻어 아래 구현으로 넘긴다.
 *
 * 세션 획득과 저장 로직을 분리한 이유: `auth()` 는 **요청 스코프**를 요구해서
 * 스크립트로 호출할 수 없다. 분리하면 저장 로직만 따로 검증할 수 있고,
 * 나중에 어드민이 대신 등록하는 경로가 생겨도 재사용된다.
 */
export async function createItem(input: CreateItemInput): Promise<CreateItemResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, fieldErrors: {}, formError: "로그인이 필요합니다" };

  const result = await createItemAs(viewer, input);

  // 캐시 무효화는 **요청 스코프**를 요구하므로 진입점에서 한다.
  // 저장 로직의 책임도 아니다 — 어디서 호출되든 저장은 같지만 무효화 대상은 다르다.
  if (result.ok) {
    // 아이템이 늘면 방·NEW 피드가 바뀐다. 판매중이 아니므로 마켓은 그대로 (D-019)
    revalidatePath("/[locale]/me", "page");
    revalidatePath("/[locale]", "page");
  }
  return result;
}

/** 저장 로직 본체 — 뷰어를 주입받는다 */
export async function createItemAs(
  viewer: Viewer,
  input: CreateItemInput,
): Promise<CreateItemResult> {
  if (!viewer.roomId) {
    return { ok: false, fieldErrors: {}, formError: "방이 없습니다" };
  }

  const category = await prisma.category.findUnique({
    where: { key: input.category },
    select: { id: true, active: true },
  });
  if (!category) {
    return { ok: false, fieldErrors: {}, formError: "존재하지 않는 카테고리입니다" };
  }
  // 비활성 카테고리는 **신규 등록만** 막는다. 기존 아이템은 그대로다 (D-036)
  if (!category.active) {
    return { ok: false, fieldErrors: {}, formError: "이 카테고리는 현재 등록할 수 없습니다" };
  }

  // 활성 속성만, 지정된 순서로 (FR-05-A-02, D-036)
  const attrs = await prisma.categoryAttribute.findMany({
    where: { categoryId: category.id, active: true },
    select: {
      id: true,
      required: true,
      attributeDefinition: { select: { key: true, type: true } },
    },
    orderBy: { displayOrder: "asc" },
  });
  if (attrs.length === 0) {
    // D-097 — 어드민이 A-02 에서 조합을 구성하지 않았다
    return {
      ok: false,
      fieldErrors: {},
      formError: "이 카테고리에 등록 가능한 속성이 아직 설정되지 않았습니다",
    };
  }

  const matchingKey = await prisma.matchingKeyDefinition.findUnique({
    where: { categoryId: category.id },
    select: { attributeKeys: true },
  });
  const matchingKeys = new Set(matchingKey?.attributeKeys ?? ["uniqueId"]);

  /* ── 검증 (FR-05-A-03) ── */
  const fieldErrors: Record<string, string> = {};
  for (const a of attrs) {
    const key = a.attributeDefinition.key;
    // 매칭 키는 "모르겠어요" 시 면제 (D-032)
    const exempt = matchingKeys.has(key) && input.unknownMatchingKey;
    if (a.required && !exempt && !input.values[key]?.trim()) {
      fieldErrors[key] = "필수 항목이에요";
    }
  }
  // 사진 1장 필수 (FR-07-A-03)
  if (input.photoCount < 1) fieldErrors.__photos = "사진을 1장 이상 등록해주세요";
  if (input.photoCount > MAX_PHOTOS) fieldErrors.__photos = `사진은 최대 ${MAX_PHOTOS}장입니다`;
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  /* ── 브랜드 (D-043 — 자유 텍스트가 아니라 마스터 참조) ── */
  let brandId: string | null = null;
  const brandName = input.values.brand?.trim();
  if (brandName) {
    const brand = await prisma.brand.findFirst({
      where: { name: brandName, active: true },
      select: { id: true },
    });
    if (!brand) {
      // 마스터에 없는 브랜드는 받지 않는다. 유저는 S-17 로 요청한다 (D-046)
      return { ok: false, fieldErrors: { brand: "목록에서 브랜드를 선택해주세요" } };
    }
    brandId = brand.id;
  }

  /* ── 도감 조회·연결·자동 생성 (D-013·D-015, FR-03-A-01·FR-03-B-01) ── */
  let codexItemId: string | null = null;
  let codexCreated = false;
  if (!input.unknownMatchingKey) {
    const keyAttr = [...matchingKeys][0];
    const raw = keyAttr ? input.values[keyAttr]?.trim() : undefined;
    if (raw) {
      // `CodexItem.normalizedKey` 가 이미 정규화된 값을 담는다 — 전수 조회 대신
      // 인덱스로 찾는다. 정규화 규칙은 검색·import 와 공유한다 (D-014)
      const normalizedKey = normalizeBrandToken(raw);
      const hit = await prisma.codexItem.findFirst({
        where: {
          categoryId: category.id,
          normalizedKey,
          // 병합으로 흡수된 도감에는 연결하지 않는다 — survivor 를 써야 한다
          mergedIntoId: null,
        },
        select: { id: true },
      });

      if (hit) {
        codexItemId = hit.id;
      } else {
        // ⚠️ **매칭 실패 = 도감 자동 생성** (D-015, FR-03-B-01). 연결만 하고
        // 말면 도감이 영원히 비어 있어 "같은 물건 가진 사람"이 성립하지 않는다.
        // 검증 상태는 **미검증**이고 보너스 경험치는 없다 (D-033, FR-03-B-03)
        // 브랜드 + 모델이 기본이다. 모델이 없을 때만 고유값을 붙인다 —
        // 둘 다 넣으면 `YETI Tundra 45 TUNDRA45` 처럼 같은 정보가 두 번 나온다.
        // 어차피 어드민이 검증하며 정리할 값이라 정교하게 만들지 않는다
        const model = input.values.model?.trim();
        const displayName =
          [brandName, model].filter(Boolean).join(" ") ||
          [brandName, raw].filter(Boolean).join(" ") ||
          raw;
        try {
          const made = await prisma.codexItem.create({
            data: {
              categoryId: category.id,
              displayName,
              uniqueId: raw,
              normalizedKey,
              verification: "UNVERIFIED",
              // 생성자와 생성 일시를 기록한다 (FR-03-B-02)
              createdByUserId: viewer.userId,
            },
            select: { id: true },
          });
          codexItemId = made.id;
          codexCreated = true;
        } catch {
          // @@unique([categoryId, normalizedKey]) 위반 = 동시 생성 경합.
          // **하나만 생성하고 나머지는 기존 것에 연결한다** (FR-03-B-05).
          // 애플리케이션에서 미리 세는 방식으로는 이 경합을 막을 수 없다
          const raced = await prisma.codexItem.findFirst({
            where: { categoryId: category.id, normalizedKey, mergedIntoId: null },
            select: { id: true },
          });
          codexItemId = raced?.id ?? null;
        }
      }
    }
  }

  /* ── 생성 ── */
  const attrByKey = new Map(attrs.map((a) => [a.attributeDefinition.key, a]));
  const item = await prisma.item.create({
    data: {
      roomId: viewer.roomId,
      categoryId: category.id,
      brandId,
      model: input.values.model?.trim() || null,
      codexItemId,
      // 초기 상태 (FR-05-A-04, D-019)
      visibility: "PUBLIC",
      saleStatus: "DISPLAYED",
      photos: {
        // 첫 사진이 대표 이미지 (FR-07-A-04). 실제 업로드는 OI-47 대기 —
        // 지금은 순서만 만들고 url 은 플레이스홀더다
        create: Array.from({ length: input.photoCount }, (_, i) => ({
          url: `placeholder://item/${i}`,
          displayOrder: i,
        })),
      },
      attributeValues: {
        create: Object.entries(input.values)
          .filter(([k, v]) => v.trim() !== "" && attrByKey.has(k))
          .map(([k, v]) => {
            const a = attrByKey.get(k)!;
            const type = a.attributeDefinition.type;
            // multiselect 는 배열로, boolean 은 진짜 boolean 으로 저장한다
            const value =
              type === "multiselect"
                ? v.split(";").map((x) => x.trim()).filter(Boolean)
                : type === "boolean"
                  ? v === "true"
                  : v.trim();
            return { categoryAttributeId: a.id, value };
          }),
      },
    },
    select: { id: true },
  });

  /* ── 경험치 (D-026 · D-056) — 1일 1회 판정은 DB 제약이 유일한 보장이다 ── */
  const expGranted = await grantExperience(viewer, "ITEM_CREATE", EXP_ITEM);

  return {
    ok: true,
    itemId: item.id,
    expGranted,
    codexLinked: codexItemId !== null,
    codexCreated,
  };
}

/**
 * 아이템 수정 (S-16, item-catalog F-05 B).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 소유자만 | D-019, FR-05-B-01 |
 * | **카테고리 변경 불가** — 속성 집합이 통째로 달라진다 | FR-05-B-02 |
 * | 매칭 키가 바뀌면 **도감 재조회·연결 갱신** | FR-05-B-03, codex FR-03-A-05 |
 * | 수정 시점에 필수로 전환된 속성이 비면 요구한다 | FR-05-B-04 |
 * | 수정으로 **경험치를 주지 않는다** | D-026, FR-05-B-05 |
 *
 * ⚠️ **등록과 코드를 합치지 않았다.** 겹치는 것은 검증뿐이고 다른 것이 많다 —
 * 카테고리 고정, 경험치 없음, 도감 **재**연결(끊는 경우 포함), 사진 개수 유지.
 * 합치면 분기가 함수 전체에 퍼져 두 흐름 모두 읽기 어려워진다.
 */
export type UpdateItemInput = {
  itemId: string;
  values: Record<string, string>;
  unknownMatchingKey: boolean;
};

export async function updateItem(input: UpdateItemInput): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");
  const result = await updateItemAs(viewer, input);
  if (result.ok) {
    revalidatePath("/[locale]/me", "page");
    revalidatePath("/[locale]/items/[itemId]", "page");
  }
  return result;
}

export async function updateItemAs(
  viewer: Viewer,
  input: UpdateItemInput,
): Promise<ActionResult> {
  const owned = await ownItem(viewer, input.itemId);
  if (!owned) return fail({}, "아이템을 찾을 수 없습니다");

  // ⚠️ 카테고리는 **기존 값을 쓴다.** 입력으로 받지 않는 것이 FR-05-B-02 의
  // 구현이다 — 받아놓고 무시하면 언젠가 누가 반영해버린다
  const categoryId = owned.categoryId;

  const attrs = await prisma.categoryAttribute.findMany({
    where: { categoryId, active: true },
    select: {
      id: true,
      required: true,
      attributeDefinition: { select: { key: true, type: true } },
    },
    orderBy: { displayOrder: "asc" },
  });

  const matchingKey = await prisma.matchingKeyDefinition.findUnique({
    where: { categoryId },
    select: { attributeKeys: true },
  });
  const matchingKeys = new Set(matchingKey?.attributeKeys ?? ["uniqueId"]);

  /* ── 검증 — 수정 시점에 필수로 바뀐 속성도 요구한다 (FR-05-B-04) ── */
  const fieldErrors: Record<string, string> = {};
  for (const a of attrs) {
    const key = a.attributeDefinition.key;
    const exempt = matchingKeys.has(key) && input.unknownMatchingKey;
    if (a.required && !exempt && !input.values[key]?.trim()) {
      fieldErrors[key] = "필수 항목이에요";
    }
  }
  if (Object.keys(fieldErrors).length > 0) return fail(fieldErrors);

  /* ── 브랜드 (D-043) ── */
  let brandId: string | null = null;
  const brandName = input.values.brand?.trim();
  if (brandName) {
    const brand = await prisma.brand.findFirst({
      where: { name: brandName, active: true },
      select: { id: true },
    });
    if (!brand) return fail({ brand: "목록에서 브랜드를 선택해주세요" });
    brandId = brand.id;
  }

  /* ── 도감 재연결 (FR-05-B-03) ── */
  // ⚠️ **연결을 끊는 경우도 있다.** 고유번호를 지우거나 "모르겠어요"로 바꾸면
  // null 이 되어야 한다. 기존 연결을 유지하면 다른 물건에 붙은 채로 남는다
  let codexItemId: string | null = null;
  if (!input.unknownMatchingKey) {
    const keyAttr = [...matchingKeys][0];
    const raw = keyAttr ? input.values[keyAttr]?.trim() : undefined;
    if (raw) {
      const hit = await prisma.codexItem.findFirst({
        where: {
          categoryId,
          normalizedKey: normalizeBrandToken(raw),
          mergedIntoId: null,
        },
        select: { id: true },
      });
      codexItemId = hit?.id ?? null;
      // 수정에서는 도감을 **자동 생성하지 않는다.** 오타를 고치는 중일 수
      // 있는데 그때마다 미검증 도감이 하나씩 생기면 병합 큐가 오염된다
    }
  }

  const attrByKey = new Map(attrs.map((a) => [a.attributeDefinition.key, a]));
  await prisma.$transaction(async (tx) => {
    await tx.item.update({
      where: { id: owned.id },
      data: {
        brandId,
        model: input.values.model?.trim() || null,
        codexItemId,
      },
    });
    // 값은 upsert 한다. 비운 값은 지운다 — 빈 문자열을 남기면 조회 계층이
    // "값이 있다"로 보고 렌더한다 (FR-06-A-02)
    for (const [key, a] of attrByKey) {
      const raw = input.values[key];
      const type = a.attributeDefinition.type;
      if (!raw?.trim()) {
        await tx.itemAttributeValue.deleteMany({
          where: { itemId: owned.id, categoryAttributeId: a.id },
        });
        continue;
      }
      const value =
        type === "multiselect"
          ? raw.split(";").map((x) => x.trim()).filter(Boolean)
          : type === "boolean"
            ? raw === "true"
            : raw.trim();
      await tx.itemAttributeValue.upsert({
        where: {
          itemId_categoryAttributeId: { itemId: owned.id, categoryAttributeId: a.id },
        },
        create: { itemId: owned.id, categoryAttributeId: a.id, value },
        update: { value },
      });
    }
  });

  // 경험치 없음 (D-026, FR-05-B-05)
  return { ok: true };
}

/**
 * 아이템 공개·비공개 전환 (FR-02-B-02·05).
 *
 * ⚠️ **판매중인 아이템을 비공개로 돌리면 마켓에서 내려간다.** 방 비공개 전환과
 * 같은 성격이라 호출부가 사전 안내를 해야 한다 (FR-02-A-05 계열).
 */
export async function setItemVisibility(
  itemId: string,
  visibility: "PUBLIC" | "PRIVATE",
): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  const owned = await ownItem(viewer, itemId);
  if (!owned) return fail({}, "아이템을 찾을 수 없습니다");

  await prisma.item.update({ where: { id: owned.id }, data: { visibility } });
  revalidatePath("/[locale]/me", "page");
  revalidatePath("/[locale]/market", "page");
  revalidatePath("/[locale]", "page");
  return { ok: true };
}
