"use server";

import { revalidatePath } from "next/cache";
import { getViewer, type Viewer } from "@/lib/auth/viewer";
import { normalizeBrandToken } from "@/lib/brand-search";
import { userLocalDate } from "@/lib/format";
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
        const displayName = [brandName, input.values.model?.trim(), raw]
          .filter(Boolean)
          .join(" ");
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

  /* ── 경험치 (D-026 · D-056) ── */
  // 1일 경계는 유저 타임존 기준이다. 운영 지표는 UTC(createdAt)로 집계하므로
  // 두 기준이 공존한다 — 섞지 말 것 (FR-01-B-07)
  const localDate = userLocalDate(viewer.timezone ?? "UTC");
  let expGranted = false;
  try {
    // @@unique([userId, reason, localDate]) 가 1일 1회의 **유일한 보장**이다.
    // 애플리케이션에서 세는 방식은 동시 요청에 뚫린다
    await prisma.experienceLog.create({
      data: { userId: viewer.userId, reason: "ITEM_CREATE", amount: EXP_ITEM, localDate },
    });
    expGranted = true;
  } catch {
    // 유니크 위반 = 오늘 이미 받았다. 정상 흐름이다 (FR-01-A-04)
    expGranted = false;
  }

  return {
    ok: true,
    itemId: item.id,
    expGranted,
    codexLinked: codexItemId !== null,
    codexCreated,
  };
}
