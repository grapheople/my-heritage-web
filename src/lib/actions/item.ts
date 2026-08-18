"use server";

import { revalidatePath } from "next/cache";
import { getViewer, type Viewer } from "@/lib/auth/viewer";
import {
  fail,
  grantExperience,
  ownItem,
  revalidate,
  type ActionResult,
} from "@/lib/actions/shared";
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
import { WORKOUT_CATEGORY } from "@/lib/categories";
import { parseRoutineSettings, type RoutineSettingsInput } from "@/lib/routine-settings";

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
    // `userCodexCreation` — 유저 등록이 도감을 만드는가 (D-231)
    select: { id: true, active: true, requiresPhoto: true, userCodexCreation: true },
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
  /*
    사진 1장 필수 — **카테고리가 정한다** (FR-07-A-02·03, D-224).

    ⚠️ 여기에 카테고리를 열거하지 않는다. D-173 이 `sellable` 을 만들며
    "운동만 코드에 예외" 안을 명시적으로 탈락시켰다 — 카테고리가 늘 때마다
    예외 목록을 고쳐야 하고 **빠뜨리면 사진 없이 등록되면 안 되는 것이
    등록된다.** 플래그면 데이터가 규칙을 들고 있다.
  */
  if (category.requiresPhoto && input.photoUrls.length < 1) {
    fieldErrors.__photos = "사진을 1장 이상 등록해주세요";
  }
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
    /*
      ⚠️ **플래그를 먼저 본다** (D-231 · `FR-10-A-02b`). 운동 카테고리는 도감을
      **어드민이 준비하므로**(D-228) 유저 등록이 도감을 만들면 안 된다.

      매칭 키가 빈 배열이라 `buildMatchingKey` 도 `null` 을 내지만, 그것에만
      의존하면 **나중에 누가 매칭 키를 채웠을 때 조용히 도감이 생긴다.** 빈
      배열은 결과이고 플래그가 의도다.
    */
    if (key && category.userCodexCreation) {
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
  /*
    ⚠️ **등록과 같은 규칙을 쓴다** (FR-07-A-15). 한쪽만 고치면 우회 경로가
    된다 — 등록은 되는데 수정에서 막히거나, 그 반대가 생긴다
  */
  const requiresPhoto = (
    await prisma.category.findUnique({
      where: { id: categoryId },
      select: { requiresPhoto: true },
    })
  )?.requiresPhoto ?? true;
  if (requiresPhoto && input.photoUrls.length < 1) {
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

/* ────────────────────────────────────────────
   구성 관계 — 부품 (D-211)
   ──────────────────────────────────────────── */

/**
 * 기존 아이템을 다른 아이템의 **부품으로 편입**한다.
 *
 * ## ⚠️ 새로 등록하지 않고 **편입**이다
 * 부품도 아이템이므로 등록 경로(`createItemAs`)를 그대로 쓴다 — 도감 매칭·
 * 정규화·키 alias 가 전부 재사용된다. 여기서는 **관계만** 맺는다.
 * 등록 경로를 하나 더 만들면 규칙이 갈린다 (D-185 가 삽입 규칙을 한 곳에 모은 이유).
 */
export async function attachPart(input: {
  parentId: string;
  partId: string;
}): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");

  const [parent, part] = await Promise.all([
    ownItem(viewer, input.parentId),
    ownItem(viewer, input.partId),
  ]);
  // ⚠️ **둘 다 내 것이어야 한다.** 남의 아이템을 내 자전거에 매달 수 없다
  if (!parent || !part) return fail({}, "아이템을 찾을 수 없습니다");
  if (parent.id === part.id) return fail({}, "자기 자신을 부품으로 넣을 수 없습니다");

  /*
    ⚠️ **깊이 1 단계만.** 부품의 부품을 허용하면 진열·판매·보유자 수 판정이
    재귀가 되고, "이 자전거의 일부의 일부"는 유저에게도 의미가 없다.
  */
  if (parent.parentId) return fail({}, "부품에는 다시 부품을 넣을 수 없습니다");
  const hasChildren = await prisma.item.count({ where: { parentId: part.id } });
  if (hasChildren > 0) return fail({}, "부품을 가진 아이템은 부품이 될 수 없습니다");

  /*
    ⚠️ **판매중·판매완료는 편입하지 않는다.** 팔고 있는 물건이 남의 자전거의
    일부가 되면 마켓에서 사라지거나(D-211 — 부품은 마켓 조회에서 빠진다)
    "이미 떠난 아이템"이 구성에 남는다
  */
  if (part.saleStatus !== "DISPLAYED") {
    return fail({}, "판매중이거나 판매완료된 아이템은 부품으로 넣을 수 없습니다");
  }

  await prisma.item.update({ where: { id: part.id }, data: { parentId: parent.id } });
  // ⚠️ 공용 헬퍼를 쓴다 — `revalidatePath` 직접 호출은 **요청 스코프 밖에서
  // 던져서** 이 액션을 스크립트로 검증할 수 없게 만든다 (`shared.ts` 주석 참조)
  revalidate("/[locale]/items/[itemId]", "/[locale]/me");
  return { ok: true };
}

/**
 * 부품을 구성에서 **떼어낸다** — 독립 아이템으로 돌아간다 (D-211 Q5).
 *
 * ⚠️ **삭제가 아니다.** 떼어내면 방 진열에 다시 나타나고 판매도 가능해진다.
 * 자전거를 팔아도 떼어낸 부품은 남길 수 있어야 한다 (D-023·D-036 과 같은 태도).
 */
export async function detachPart(partId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");
  const part = await ownItem(viewer, partId);
  if (!part) return fail({}, "아이템을 찾을 수 없습니다");
  if (!part.parentId) return fail({}, "부품이 아닙니다");

  await prisma.item.update({ where: { id: part.id }, data: { parentId: null } });
  revalidate("/[locale]/items/[itemId]", "/[locale]/me");
  return { ok: true };
}

/* ─────────────── 루틴 구성 — 담기·빼기·순서·내 설정 (D-227) ─────────────── */

/**
 * 루틴에 **운동을 담는다** (`FR-10-B-01·03·04`).
 *
 * ## ⚠️ D-221 과 규칙이 달라졌다 — 담는 대상이 아이템이 아니다
 * | | D-221 (폐기) | 지금 (D-227) |
 * |---|---|---|
 * | 담는 대상 | 내 종목 **아이템** | **`Exercise` 마스터** (전역) |
 * | 소유 검증 | 루틴·종목 **둘 다** 내 것 | **루틴만** 내 것 |
 * | 루틴에 루틴 | 명시적으로 차단 | **타입이 막는다** |
 * | 같은 카테고리 | 명시적으로 검증 | 마스터가 운동뿐이라 **성립 불필요** |
 * | 내 설정 | 종목 아이템의 속성값 | **이 관계 행에** 실린다 |
 *
 * 검증이 줄어든 것이 이 개편의 이득이다 — 막을 것이 없어졌다.
 */
export async function attachExercise(input: {
  routineId: string;
  exerciseId: string;
  settings?: RoutineSettingsInput;
}): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");
  const res = await attachExerciseAs(viewer, input);
  if (res.ok) revalidate("/[locale]/items/[itemId]", "/[locale]/me");
  return res;
}

/**
 * 본체 — **뷰어를 주입받는다.** 요청 스코프가 필요 없어 스크립트로 검증할 수
 * 있다 (`10-frontend-spec` §6-2 가 정한 분리). `auth()` 와 `revalidatePath()` 는
 * 요청 스코프를 요구하므로 진입점에만 둔다.
 */
export async function attachExerciseAs(
  viewer: Viewer,
  input: { routineId: string; exerciseId: string; settings?: RoutineSettingsInput },
): Promise<ActionResult> {
  const routine = await ownItem(viewer, input.routineId);
  if (!routine) return fail({}, "루틴을 찾을 수 없습니다");
  /*
    ⚠️ **운동 카테고리인지 본다.** 제품군(`routine`)으로 가르던 판정이 사라졌다
    (`FR-10-A-08`) — 운동 카테고리의 아이템은 루틴뿐이므로 카테고리가 곧 답이다
  */
  if (routine.categoryKey !== WORKOUT_CATEGORY) return fail({}, "루틴이 아닙니다");

  /*
    ⚠️ **비활성 운동은 새로 담지 못한다** (`FR-11-C-07`). 이미 담긴 루틴에서는
    유지되지만(`FR-10-B-08`) 새 후보로는 내지 않는다 — 목록에서 빠져 있어도
    직접 호출은 막아야 한다
  */
  const exercise = await prisma.exercise.findFirst({
    where: { id: input.exerciseId, active: true },
    select: { id: true },
  });
  if (!exercise) return fail({}, "운동을 찾을 수 없습니다");

  /*
    ⚠️ **순서는 맨 뒤에 붙인다.** 0 으로 넣으면 기존 항목과 겹쳐 정렬이
    불안정해진다 — 같은 루틴이 새로고침마다 다르게 보인다
  */
  const last = await prisma.routineExercise.findFirst({
    where: { routineItemId: routine.id },
    orderBy: { displayOrder: "desc" },
    select: { displayOrder: true },
  });

  const parsed = parseRoutineSettings(input.settings);
  if (!parsed.ok) return fail({}, parsed.message);

  try {
    await prisma.routineExercise.create({
      data: {
        routineItemId: routine.id,
        exerciseId: exercise.id,
        displayOrder: (last?.displayOrder ?? -1) + 1,
        ...parsed.data,
      },
    });
  } catch {
    // `@@unique` 위반 = 이미 담겨 있다 (`FR-10-B-03`). 경합도 여기로 온다
    return fail({}, "이미 이 루틴에 담긴 운동입니다");
  }

  return { ok: true };
}

/**
 * 루틴에서 **운동을 뺀다** (`FR-10-B-07`).
 *
 * ⚠️ **마스터는 건드리지 않는다.** 관계와 내 설정만 사라진다 — 운동은 어드민
 * 데이터이고 다른 유저의 루틴에 그대로 남아 있다. D-221 의 "종목이 방 진열로
 * 돌아온다"는 **성립하지 않는다** (종목이 아이템이 아니다).
 */
export async function detachExercise(input: {
  routineId: string;
  exerciseId: string;
}): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");
  const res = await detachExerciseAs(viewer, input);
  if (res.ok) revalidate("/[locale]/items/[itemId]", "/[locale]/me");
  return res;
}

/** 본체 — 뷰어 주입 (위 분리 이유 참조) */
export async function detachExerciseAs(
  viewer: Viewer,
  input: { routineId: string; exerciseId: string },
): Promise<ActionResult> {
  // 루틴이 내 것인지만 보면 된다 — 관계는 루틴에 매달려 있다
  const routine = await ownItem(viewer, input.routineId);
  if (!routine) return fail({}, "루틴을 찾을 수 없습니다");

  await prisma.routineExercise.deleteMany({
    where: { routineItemId: routine.id, exerciseId: input.exerciseId },
  });

  return { ok: true };
}

/**
 * 루틴 안 운동 **순서를 바꾼다** (`FR-10-B-02`).
 *
 * ⚠️ **없는 관계는 건너뛴다** (E-10-05). 다른 기기에서 운동을 빼는 사이에
 * 순서를 저장하면 그 id 가 사라져 있다 — 전체를 실패시키면 유저는 이유를
 * 알 수 없고 순서도 잃는다. **있는 것만 적용한다.**
 */
export async function reorderExercises(input: {
  routineId: string;
  /** 원하는 순서대로 나열된 **운동 마스터 id** */
  exerciseIds: string[];
}): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");
  const res = await reorderExercisesAs(viewer, input);
  if (res.ok) revalidate("/[locale]/items/[itemId]", "/[locale]/me");
  return res;
}

/** 본체 — 뷰어 주입 (위 분리 이유 참조) */
export async function reorderExercisesAs(
  viewer: Viewer,
  input: { routineId: string; exerciseIds: string[] },
): Promise<ActionResult> {
  const routine = await ownItem(viewer, input.routineId);
  if (!routine) return fail({}, "루틴을 찾을 수 없습니다");

  const rows = await prisma.routineExercise.findMany({
    where: { routineItemId: routine.id },
    select: { id: true, exerciseId: true },
  });
  const byExercise = new Map(rows.map((r) => [r.exerciseId, r.id]));

  const updates = input.exerciseIds
    .map((exerciseId, i) => ({ id: byExercise.get(exerciseId), displayOrder: i }))
    .filter((u): u is { id: string; displayOrder: number } => Boolean(u.id));

  /*
    ⚠️ **한 트랜잭션에서 바꾼다.** 도중에 실패하면 순서가 절반만 적용된 상태가
    남고, 그 상태는 화면에서 정상처럼 보인다 — 알아채기 어렵다
  */
  await prisma.$transaction(
    updates.map((u) =>
      prisma.routineExercise.update({
        where: { id: u.id },
        data: { displayOrder: u.displayOrder },
      }),
    ),
  );

  return { ok: true };
}

/**
 * 루틴 안 한 운동의 **내 설정을 저장한다** (`FR-10-B-04·05·06`).
 *
 * ## ⚠️ 이것이 D-227 이 새로 만든 자리다
 * 전에는 세트·중량이 **종목 아이템의 속성값**이라 아이템 수정 폼이 다뤘고, 그
 * 값은 종목 하나에 하나뿐이었다. 지금은 **루틴별로 독립**하므로(`FR-10-B-05`)
 * 저장 대상이 `(루틴, 운동)` 쌍이다.
 *
 * ⚠️ **빈 문자열은 "지움"이다.** 7종 전부 선택이므로(`FR-10-B-06`) 유저가 칸을
 * 비우면 `null` 로 저장한다 — 무시하면 한번 넣은 값을 못 지운다.
 */
export async function updateRoutineExercise(input: {
  routineId: string;
  exerciseId: string;
  settings: RoutineSettingsInput;
}): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail({}, "로그인이 필요합니다");
  const res = await updateRoutineExerciseAs(viewer, input);
  if (res.ok) revalidate("/[locale]/items/[itemId]", "/[locale]/me");
  return res;
}

/** 본체 — 뷰어 주입 (위 분리 이유 참조) */
export async function updateRoutineExerciseAs(
  viewer: Viewer,
  input: { routineId: string; exerciseId: string; settings: RoutineSettingsInput },
): Promise<ActionResult> {
  const routine = await ownItem(viewer, input.routineId);
  if (!routine) return fail({}, "루틴을 찾을 수 없습니다");

  const parsed = parseRoutineSettings(input.settings);
  if (!parsed.ok) return fail({}, parsed.message);

  const res = await prisma.routineExercise.updateMany({
    where: { routineItemId: routine.id, exerciseId: input.exerciseId },
    data: parsed.data,
  });
  if (res.count === 0) return fail({}, "이 루틴에 담긴 운동이 아닙니다");

  return { ok: true };
}
