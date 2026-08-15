"use server";

import { revalidatePath } from "next/cache";
import { getViewer, type Viewer } from "@/lib/auth/viewer";
import { fail, grantExperience, ownItem, type ActionResult } from "@/lib/actions/shared";
import {
  buildMatchingKey,
  codexDisplayName,
  uniqueIdForCodex,
} from "@/lib/codex-key";
import {
  logCodexMatch,
  resolveCodexByKey,
  syncPrimaryMatchKey,
  type MatchVia,
} from "@/lib/codex-match-key";
import {
  ATTRIBUTE_SCOPE_ORDER,
  attributeScopeWhere,
  resolveMatchingKeyOrder,
  resolveSubtypeId,
} from "@/lib/subtype";
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
  /**
   * 업로드된 사진 URL. **순서가 곧 표시 순서**이고 **첫 장이 대표 이미지**다
   * (D-037, FR-07-A-04). 업로드는 `/api/upload` 가 먼저 끝내고 폼이 URL 만
   * 들고 온다 — 등록 요청에 바이트를 실으면 타임아웃에 걸린다
   */
  photoUrls: string[];
  /** 유저 별칭(선택) — 같은 도감 아이템 구분용 (D-112) */
  nickname?: string;
  /**
   * D-207 — 하위 제품군 `key` (캠핑의 `tent`·`lantern`). **선택이다.**
   * 제품군이 없는 카테고리는 보내지 않으며, 그때 폼은 공통 속성만 그린다.
   * ⚠️ 서버가 카테고리 소속을 다시 검증한다 — 폼 값을 믿지 않는다
   */
  subtype?: string;
};

export type CreateItemResult =
  | {
      ok: true;
      itemId: string;
      expGranted: boolean;
      codexLinked: boolean;
      /** 도감이 새로 만들어졌는가 — 유저에게 알린다 (FR-03-B-03) */
      codexCreated: boolean;
      /**
       * FR-03-E-03 — **키 alias 로 연결됐는가.** 유저가 넣은 값과 연결된 도감이
       * 다르므로 "무엇으로 어디에 연결됐는지"를 보여줘야 한다 (D-193).
       */
      codexMatchedByAlias: boolean;
      /** 키 alias 로 연결됐을 때 유저가 실제로 넣은 정규화 값 */
      codexAttemptedKey?: string;
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
  // ⚠️ **세션의 `roomId` 를 쓰지 않는다** (D-132). 그 값은 로그인 시점 JWT 에
  // 박혀 있어 낡을 수 있고, 낡으면 외래키 위반으로 터진다. `Room.userId` 가
  // 유일값이라 유저를 기준으로 찾는 것이 항상 맞다
  const room = await prisma.room.findUnique({
    where: { userId: viewer.userId },
    select: { id: true },
  });
  if (!room) {
    return { ok: false, fieldErrors: {}, formError: "방이 없습니다" };
  }
  const roomId = room.id;

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

  /*
    하위 제품군 (D-207) — **선택이다.** 캠핑 외 카테고리는 `null` 이고 그때
    아래 조회·해석이 전부 지금과 같게 동작한다.

    ⚠️ **폼이 보낸 값을 그대로 믿지 않는다.** 다른 카테고리의 제품군을 붙이면
    속성 집합이 통째로 어긋난다
  */
  const st = await resolveSubtypeId({ categoryId: category.id, subtypeKey: input.subtype });
  if (!st.ok) return { ok: false, fieldErrors: { __subtype: st.error } };
  const subtypeId = st.subtypeId;

  // 활성 속성만, 지정된 순서로 (FR-05-A-02, D-036).
  // **공통 + 선택된 제품군**을 합친다 (D-207)
  const attrs = await prisma.categoryAttribute.findMany({
    where: attributeScopeWhere({ categoryId: category.id, subtypeId }),
    select: {
      id: true,
      required: true,
      attributeDefinition: { select: { key: true, type: true } },
    },
    orderBy: ATTRIBUTE_SCOPE_ORDER,
  });
  if (attrs.length === 0) {
    // D-097 — 어드민이 A-02 에서 조합을 구성하지 않았다
    return {
      ok: false,
      fieldErrors: {},
      formError: "이 카테고리에 등록 가능한 속성이 아직 설정되지 않았습니다",
    };
  }

  // 순서가 정규화 순서다 (FR-01-A-05) — Set 으로만 들고 있으면 순서를 잃는다.
  // ⚠️ **면제 판정용 Set 은 없어졌다** (D-169) — 매칭 키가 `required` 가 아니므로
  // 필수 검증에서 매칭 키를 특별 취급할 필요가 없다.
  // 제품군 것이 있으면 그것이 이긴다 (D-207)
  const keyOrder = await resolveMatchingKeyOrder({ categoryId: category.id, subtypeId });

  /* ── 검증 (FR-05-A-03) ── */
  const fieldErrors: Record<string, string> = {};
  for (const a of attrs) {
    const key = a.attributeDefinition.key;
    // ⚠️ 면제가 없어졌다 (D-169). 매칭 키는 `required` 가 아니므로 비워도 통과하고,
    // 비면 아래에서 `buildMatchingKey` 가 `null` 을 내 도감 연결이 건너뛰어진다
    if (a.required && !input.values[key]?.trim()) {
      fieldErrors[key] = "필수 항목이에요";
    }
  }
  // 사진 1장 필수 (FR-07-A-03)
  if (input.photoUrls.length < 1) fieldErrors.__photos = "사진을 1장 이상 등록해주세요";
  if (input.photoUrls.length > MAX_PHOTOS) {
    fieldErrors.__photos = `사진은 최대 ${MAX_PHOTOS}장입니다`;
  }
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

  /* ── 도감 조회·연결·자동 생성 (D-013·D-015, FR-03-A-01·FR-03-B-01·FR-03-E) ── */
  let codexItemId: string | null = null;
  let codexCreated = false;
  /** FR-03-E-03·06 — 어떤 경로로 연결됐는가. 도감 미연결이면 null */
  let matchVia: MatchVia | null = null;
  let attemptedKey: string | null = null;
  {
    // ⚠️ **복합 키를 전부 쓴다** (D-013). 첫 키만 쓰면 캠핑에서 Snow Peak
    // 제품이 도감 한 칸으로 뭉친다 — `lib/codex-key.ts` 참조
    const key = buildMatchingKey(keyOrder, input.values);
    if (key) {
      const normalizedKey = key.normalizedKey;
      attemptedKey = normalizedKey;
      /*
        ⚠️ **①② 를 한 쿼리로 본다** (D-197). 정식 값 완전일치가 먼저이고
        키 alias 가 그 다음이다 — 뒤집으면 정식 값으로 등록한 유저가 동의어 쪽
        도감으로 끌려간다 (AC-02-B-05-2).

        ⚠️ **키 alias 로 잡혀도 유저가 넣은 값은 고치지 않는다** (FR-03-E-02,
        D-193). D-190 브랜드 게이트는 정식 명칭으로 교정하지만 그건 `select` 라
        유저가 목록에서 고른 값이기 때문이다. 스타일 코드는 **박스에서 읽어 넣은
        값**이라(D-189) 조용히 바꾸면 그 결정의 근거를 스스로 부순다.
      */
      const hit = await resolveCodexByKey({ categoryId: category.id, normalizedKey });

      if (hit) {
        codexItemId = hit.codexItemId;
        matchVia = hit.via;
      } else {
        // ⚠️ **매칭 실패 = 도감 자동 생성** (D-015, FR-03-B-01). 연결만 하고
        // 말면 도감이 영원히 비어 있어 "같은 물건 가진 사람"이 성립하지 않는다.
        // 검증 상태는 **미검증**이고 보너스 경험치는 없다 (D-033, FR-03-B-03)
        const displayName = codexDisplayName(brandName, input.values.model, key);
        try {
          /*
            ⚠️ **매칭 인덱스 행을 같은 트랜잭션에서 만든다** (D-197). 도감만
            만들고 PRIMARY 행을 빠뜨리면 그 도감은 `CodexItem` 에는 있는데
            **매칭으로는 영원히 닿지 않는다** — 보유자만 0명인 도감이 생기는
            D-185·D-186 과 같은 실패 모양이다.
          */
          codexItemId = await prisma.$transaction(async (tx) => {
            const made = await tx.codexItem.create({
              data: {
                categoryId: category.id,
                displayName,
                // 복합 키에서는 비운다 — 이어붙인 문자열은 "고유번호"가 아니다
                uniqueId: uniqueIdForCodex(keyOrder, key.raw),
                normalizedKey,
                verification: "UNVERIFIED",
                // 생성자와 생성 일시를 기록한다 (FR-03-B-02)
                createdByUserId: viewer.userId,
              },
              select: { id: true },
            });
            await syncPrimaryMatchKey(tx, {
              codexItemId: made.id,
              categoryId: category.id,
              normalizedKey,
            });
            return made.id;
          });
          codexCreated = true;
          matchVia = "created";
        } catch {
          /*
            유니크 제약 위반 = 동시 생성 경합. **하나만 생성하고 나머지는 기존
            것에 연결한다** (FR-03-B-05). 애플리케이션에서 미리 세는 방식으로는
            이 경합을 막을 수 없다.

            ⚠️ 이제 제약이 둘이다 — `CodexItem` 의 `normalizedKey` 와
            `CodexMatchKey` 의 `[categoryId, value]`. 어느 쪽에 걸렸든 **이미
            그 값을 가진 도감이 있다**는 뜻이므로 매칭 인덱스로 다시 찾는다
            (키 alias 로 선점된 경우까지 여기서 흡수된다).
          */
          const raced = await resolveCodexByKey({
            categoryId: category.id,
            normalizedKey,
          });
          codexItemId = raced?.codexItemId ?? null;
          matchVia = raced?.via ?? null;
        }
      }
    }
  }

  /* ── 생성 ── */
  const attrByKey = new Map(attrs.map((a) => [a.attributeDefinition.key, a]));
  const item = await prisma.item.create({
    data: {
      roomId,
      categoryId: category.id,
      subtypeId,
      brandId,
      model: input.values.model?.trim() || null,
      nickname: input.nickname?.trim() || null,
      codexItemId,
      // 초기 상태 (FR-05-A-04, D-019)
      visibility: "PUBLIC",
      saleStatus: "DISPLAYED",
      photos: {
        // 첫 장이 대표 이미지 (FR-07-A-04). 순서를 그대로 쓴다
        create: input.photoUrls.map((url, i) => ({ url, displayOrder: i })),
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

  /*
    ⚠️ **계측은 저장이 끝난 뒤다** (FR-03-E-08, D-198). D-178 이 알림 생성을
    본 작업 뒤에 둔 것과 같은 판단 — 계측 장애가 등록을 막으면 안 된다.
    `logCodexMatch` 는 스스로 던지지 않는다.
  */
  if (matchVia && attemptedKey) {
    await logCodexMatch({
      categoryId: category.id,
      // `input.category` 가 곧 카테고리 key 다 — 위 조회의 where 조건이다
      categoryKey: input.category,
      brandId,
      attempted: attemptedKey,
      via: matchVia,
    });
  }

  return {
    ok: true,
    itemId: item.id,
    expGranted,
    codexLinked: codexItemId !== null,
    codexCreated,
    /** FR-03-E-03 — 키 alias 로 연결됐으면 호출부가 근거를 표시한다 */
    codexMatchedByAlias: matchVia === "keyAlias",
    codexAttemptedKey: matchVia === "keyAlias" ? (attemptedKey ?? undefined) : undefined,
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
  /** 사진 URL. **순서가 표시 순서**이고 첫 장이 대표다 (FR-07-A-04·05) */
  photoUrls: string[];
  nickname?: string;
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

  /*
    ⚠️ **제품군도 기존 값을 쓴다** — 카테고리와 같은 이유다 (FR-05-B-02).
    수정에서 제품군을 바꾸면 속성 집합이 통째로 갈리고, 이미 입력된 값들이
    갈 곳을 잃는다. 바꾸려면 지우고 다시 등록하는 것이 명확하다
  */
  const subtypeId = owned.subtypeId;

  const attrs = await prisma.categoryAttribute.findMany({
    where: attributeScopeWhere({ categoryId, subtypeId }),
    select: {
      id: true,
      required: true,
      attributeDefinition: { select: { key: true, type: true } },
    },
    orderBy: ATTRIBUTE_SCOPE_ORDER,
  });

  // 등록과 **같은 해석기**를 쓴다 (D-207)
  const keyOrder = await resolveMatchingKeyOrder({ categoryId, subtypeId });

  /* ── 검증 — 수정 시점에 필수로 바뀐 속성도 요구한다 (FR-05-B-04) ── */
  const fieldErrors: Record<string, string> = {};
  for (const a of attrs) {
    const key = a.attributeDefinition.key;
    // 면제 없음 (D-169) — 등록과 같은 기준이다
    if (a.required && !input.values[key]?.trim()) {
      fieldErrors[key] = "필수 항목이에요";
    }
  }
  // 사진 1장 필수는 수정에서도 같다 (FR-07-A-03)
  if (input.photoUrls.length < 1) {
    fieldErrors.__photos = "사진을 1장 이상 등록해주세요";
  }
  if (input.photoUrls.length > MAX_PHOTOS) {
    fieldErrors.__photos = `사진은 최대 ${MAX_PHOTOS}장입니다`;
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
  // ⚠️ **연결을 끊는 경우도 있다.** 고유번호를 지우면 null 이 되어야 한다 —
  // 기존 연결을 유지하면 다른 물건에 붙은 채로 남는다 (D-169: 빈 값이 곧 "모름")
  let codexItemId: string | null = null;
  {
    // 등록과 **같은 규칙**을 써야 한다. 여기만 첫 키를 쓰면 수정 한 번으로
    // 도감 연결이 다른 곳으로 옮겨간다
    const key = buildMatchingKey(keyOrder, input.values);
    if (key) {
      // ⚠️ **등록과 같은 해석기를 쓴다** (D-197). 여기만 `normalizedKey` 직접
      // 조회로 두면 **키 alias 로 등록된 아이템이 수정 한 번에 연결을 잃는다**
      const hit = await resolveCodexByKey({
        categoryId,
        normalizedKey: key.normalizedKey,
      });
      codexItemId = hit?.codexItemId ?? null;
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
        nickname: input.nickname?.trim() || null,
        codexItemId,
      },
    });
    // 사진은 통째로 다시 만든다 — 순서 변경(FR-07-A-05)까지 한 번에 반영된다.
    // ⚠️ 스토리지 파일은 지우지 않는다. 되돌릴 수 없고, 정리는 미참조 blob 을
    // 훑는 배치의 몫이다 (OI-66)
    await tx.itemPhoto.deleteMany({ where: { itemId: owned.id } });
    await tx.itemPhoto.createMany({
      data: input.photoUrls.map((url, i) => ({ itemId: owned.id, url, displayOrder: i })),
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
