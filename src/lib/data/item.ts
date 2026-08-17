import type { CodexAttr, ItemDetail } from "@/lib/data/types";
import type { Viewer } from "@/lib/auth/viewer";
import type { CurrencyCode } from "@/lib/format";
import { blockedUserIds } from "@/lib/data/scope";
import { realPhotoUrl } from "@/lib/data/photo";
import { levelOf } from "@/lib/data/level";
import { deriveItemName, NAME_SELECT } from "@/lib/data/item-name";
import type { Locale } from "@/i18n/routing";
import { pickCategoryAttrLabel, pickLabel } from "@/lib/data/label";
import { prisma } from "@/lib/prisma";
import { DISPLAYABLE_ITEM } from "@/lib/item-display";
import { MUSCLE_SELECT, musclesFrom, musclesOfRoutine } from "@/lib/data/muscles";

/**
 * S-05 아이템 상세.
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | 공개 판정은 **방 AND 아이템** | D-019, M-06 |
 * | 구매처·구매일·구매가는 **소유자에게만** | D-019, FR-06-A-05 |
 * | 활성 속성값만. 빈 값은 렌더하지 않는다 | D-036, FR-06-A-01·02 |
 * | 명칭은 파생값 | D-073, M-14 |
 * | 연결된 **공개** 일기 | FR-06-A-04 |
 */

/** ⚠️ 타인에게 보이면 안 되는 소유 정보 (FR-06-A-05) */
const OWNER_ONLY_KEYS = new Set(["purchasedFrom", "purchaseDate", "purchasePrice"]);

/** 속성값 Json → 표시 문자열. multiselect 는 배열, boolean 은 진짜 boolean 이다 */
function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/**
 * `select`·`multiselect` 값을 **로케일 라벨로** 바꾼다 (D-155).
 *
 * ## ⚠️ 저장값은 옵션 **키**다 — 그대로 내면 영어가 보인다
 * `condition` 은 `lightlyUsed`, `accessories` 는 `["box","manual"]` 로 저장된다.
 * D-135 에서 **속성 라벨**을 DB 에서 읽도록 고쳤지만 **옵션 라벨은 빠뜨렸다** —
 * `AttributeOption.labelKo/Ja/En` 이 존재하는데 아무도 읽지 않았다.
 * 그래서 한국어 화면에 "상태: lightlyUsed"가 나왔다.
 *
 * ## ⚠️ 키를 못 찾으면 키를 그대로 낸다
 * 옵션이 비활성화됐거나(`active: false`) 삭제된 뒤에도 **값은 보존된다**
 * (D-036, M-09). 빈 문자열로 만들면 값이 있는데 화면에서 사라진다 — 영어 키가
 * 보이는 것보다 값이 없어 보이는 것이 더 나쁘다.
 */
function optionLabel(
  locale: Locale,
  options: { key: string; labelKo: string; labelJa: string; labelEn: string }[],
  raw: unknown,
): string {
  const one = (k: string) => {
    const hit = options.find((o) => o.key === k);
    return hit
      ? pickLabel(locale, { ko: hit.labelKo, ja: hit.labelJa, en: hit.labelEn }) || k
      : k;
  };
  // 다중선택은 배열로 저장된다 — 표시 순서는 저장 순서를 따른다
  if (Array.isArray(raw)) return raw.map((v) => one(String(v))).join(", ");
  return one(String(raw));
}

export async function getItemDetail(
  itemId: string,
  viewer: Viewer | null,
  locale: Locale,
): Promise<ItemDetail | null> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      visibility: true,
      saleStatus: true,
      price: true,
      currency: true,
      externalUrl: true,
      codexItemId: true,
      category: { select: { key: true, sellable: true } },
      room: {
        select: { id: true, name: true, visibility: true, userId: true, user: { select: { deletedAt: true } } },
      },
      photos: { select: { url: true }, orderBy: { displayOrder: "asc" } },
      attributeValues: {
        select: {
          value: true,
          categoryAttribute: {
            select: {
              active: true,
              displayOrder: true,
              // 카테고리별 라벨 override (D-168)
              labelKo: true, labelJa: true, labelEn: true,
              // ⚠️ 라벨은 **DB 에서** 온다 (D-135). 어드민이 추가한 속성은
              // 메시지 파일에 키가 없어 `t()` 로는 이름을 낼 수 없다
              attributeDefinition: {
                select: {
                  key: true,
                  type: true,
                  labelKo: true,
                  labelJa: true,
                  labelEn: true,
                  // ⚠️ **단위도 3개 언어다** (D-038, FR-02-A-08). 폼(`attr-field`)은
                  // 보여주는데 상세가 빠뜨리고 있었다 — "세트 사이 휴식: 180" 이
                  // 초인지 분인지 알 수 없다 (D-166 에서 드러났다)
                  unitKo: true,
                  unitJa: true,
                  unitEn: true,
                  // ⚠️ **옵션 라벨도 DB 에서** 온다 (D-155). 저장값은 옵션
                  // 키(`lightlyUsed`)라 그대로 내면 한국어 화면에 영어가 보인다.
                  // 비활성 옵션도 가져온다 — 값이 보존되므로(D-036) 라벨이
                  // 필요하다
                  /*
                    ⚠️ **여기서는 카테고리 스코프로 거르지 않는다** (D-209).
                    이것은 **표시** 경로다 — 이미 저장된 값의 라벨을 찾는 데
                    쓰인다. 거르면 나중에 스코프가 좁혀졌을 때 **기존 아이템의
                    값이 raw key 로 보인다.** D-036 의 "값은 보존된다"와 같은
                    비대칭이다 (입력에서는 빠지고, 표시에서는 남는다)
                  */
                  options: {
                    select: {
                      key: true,
                      labelKo: true,
                      labelJa: true,
                      labelEn: true,
                      // 자극부위 순서 고정에 쓴다 (FR-10-D-03) — 없으면 흔들린다
                      displayOrder: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      /*
        D-211 — 구성 부품. **부품도 아이템**이라 명칭 파생(D-073)이 같다.
        제품군 라벨을 함께 낸다 — "프레임 / 구동계" 를 보여줘야 목록이 읽힌다
      */
      parts: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          codexItemId: true,
          subtype: { select: { labelKo: true, labelJa: true, labelEn: true } },
          ...NAME_SELECT,
        },
      },
      /** 이 아이템 자체가 부품일 때 부모로 돌아가는 길 */
      parent: { select: { id: true, ...NAME_SELECT } },
      /*
        D-221 — **루틴이 담은 종목들.** 순서가 곧 내용이므로 `displayOrder` 로
        정렬한다. 자극부위는 이 목록에서 **계산**한다 (FR-10-D-01·02)
      */
      routineItems: {
        orderBy: { displayOrder: "asc" },
        select: {
          exercise: { select: { id: true, ...NAME_SELECT, ...MUSCLE_SELECT } },
        },
      },
      /** 이 아이템(종목)이 속한 루틴들 — 되돌아가는 길 */
      routineMemberships: {
        select: { routine: { select: { id: true, ...NAME_SELECT } } },
      },
      /** 루틴인지 종목인지 (D-221) */
      subtype: { select: { key: true } },
      ...NAME_SELECT,
    },
  });
  if (!item || item.room.user.deletedAt) return null;

  const owner = viewer?.roomId === item.room.id;

  if (!owner) {
    // 차단 관계면 존재 자체를 숨긴다 (D-051)
    const blockedIds = await blockedUserIds(viewer);
    if (blockedIds.includes(item.room.userId)) return null;
    // 방 AND 아이템 둘 다 공개여야 한다 (D-019, M-06)
    if (item.room.visibility !== "PUBLIC" || item.visibility !== "PUBLIC") return null;
  }

  const values = item.attributeValues
    // 비활성 속성은 값이 보존되지만 **표시에서 제외**된다 (D-036, M-09)
    .filter((v) => v.categoryAttribute.active)
    .sort((a, b) => a.categoryAttribute.displayOrder - b.categoryAttribute.displayOrder);

  const attrs: CodexAttr[] = [];
  const ownerInfo: ItemDetail["owner"] = {};
  let refUrl: string | undefined;
  /**
   * 속성 key → 라벨. **소유자 전용 항목과 참고 링크도 여기서 이름을 얻는다**
   * (D-135). 그것들만 메시지 파일을 쓰면 어드민이 A-02 에서 이름을 바꿨을 때
   * 같은 속성이 화면 두 곳에서 다르게 불린다
   */
  const labels: Record<string, string> = {};

  for (const v of values) {
    const def = v.categoryAttribute.attributeDefinition;
    const key = def.key;
    // 선택형은 옵션 라벨로 바꾼다 (D-155). 나머지는 저장값이 곧 표시값이다
    const raw =
      def.type === "select" || def.type === "multiselect"
        ? optionLabel(locale, def.options, v.value)
        : displayValue(v.value);
    if (!raw) continue; // 값이 빈 항목은 렌더하지 않는다 (FR-06-A-02)
    /*
      단위를 붙인다 (D-038, FR-02-A-08). `number` 에만 단위가 있다 — 선택형·날짜에
      붙이면 "밀기 kg" 같은 값이 나온다. 값이 없으면 단위도 내지 않는다(위 `continue`).
    */
    const unit =
      def.type === "number"
        ? pickLabel(locale, { ko: def.unitKo, ja: def.unitJa, en: def.unitEn })
        : "";
    const text = unit ? `${raw} ${unit}` : raw;

    labels[key] = pickCategoryAttrLabel(locale, v.categoryAttribute);

    if (OWNER_ONLY_KEYS.has(key)) {
      // ⚠️ 타인에게는 **응답에 넣지 않는다.** 화면에서 감추는 것이 아니다
      if (owner) {
        if (key === "purchasedFrom") ownerInfo.purchasedFrom = text;
        if (key === "purchaseDate") ownerInfo.purchaseDate = text;
        if (key === "purchasePrice") ownerInfo.purchasePrice = text;
      }
      continue;
    }
    if (key === "referenceUrl") {
      // 외부 링크는 경고를 경유해야 한다 (D-040) — 별도 필드로 뺀다
      refUrl = text;
      continue;
    }
    attrs.push({ key, label: labels[key], value: text });
  }

  const diaries = await prisma.diary.findMany({
    where: {
      items: { some: { itemId } },
      // 타인에게는 공개 일기만 (FR-04-A-03)
      ...(owner ? {} : { visibility: "PUBLIC" as const }),
    },
    select: { id: true, createdAt: true, body: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return {
    id: item.id,
    name: deriveItemName(item),
    nickname: item.nickname ?? undefined,
    // D-211 — 부품도 아이템이라 명칭 파생이 같다 (D-073)
    parts: item.parts.map((p) => ({
      id: p.id,
      name: deriveItemName(p),
      subtypeLabel: p.subtype
        ? pickLabel(locale, { ko: p.subtype.labelKo, ja: p.subtype.labelJa, en: p.subtype.labelEn })
        : undefined,
      codexId: p.codexItemId ?? undefined,
    })),
    parent: item.parent ? { id: item.parent.id, name: deriveItemName(item.parent) } : undefined,
    /*
      D-221 — 루틴 구성. **빈 배열이면 종목 0개인 루틴**이고, 그 상태는 루틴을
      만든 직후 반드시 거친다 (E-10-01) — `undefined` 와 구분해야 화면이
      "종목을 추가하세요"를 낼 수 있다
    */
    isRoutine: item.subtype?.key === "routine",
    exercises: item.routineItems.map((r) => ({
      id: r.exercise.id,
      name: deriveItemName(r.exercise),
      muscles: musclesFrom(r.exercise.attributeValues),
    })),
    /** 이 종목이 속한 루틴들 (FR-10-C-01 로 진열에서 빠진 이유를 알린다) */
    routines: item.routineMemberships.map((m) => ({
      id: m.routine.id,
      name: deriveItemName(m.routine),
    })),
    /** 근육맵 입력 — 루틴이면 구성 종목의 합집합, 종목이면 자기 값 */
    muscles:
      item.routineItems.length > 0
        ? musclesOfRoutine(item.routineItems.map((r) => r.exercise))
        // ⚠️ 아이템 상세는 이미 `attributeValues` 를 갖고 있다. 별도 select 를
        // 펼치면 **그것을 덮어써** 단위·라벨이 통째로 사라진다 (겪었다)
        : musclesFrom(item.attributeValues),
    categoryKey: `category.${item.category.key}`,
    roomId: item.room.id,
    roomName: item.room.name,
    ownerLevel: await levelOf(item.room.userId),
    visibility: item.visibility,
    saleStatus: item.saleStatus,
    sellable: item.category.sellable,
    roomPublic: item.room.visibility === "PUBLIC",
    codexId: item.codexItemId ?? undefined,
    // 스토리지 전 플레이스홀더는 없는 것으로 다룬다 (OI-47 잔재)
    photos: item.photos.map((p) => realPhotoUrl(p.url)).filter((u): u is string => !!u),
    attrs,
    owner: ownerInfo,
    diaries: diaries.map((d) => ({
      id: d.id,
      date: d.createdAt.toISOString().slice(0, 10),
      excerpt: d.body.slice(0, 80),
    })),
    sale:
      item.saleStatus === "ON_SALE" && item.price !== null && item.currency !== null && item.externalUrl
        ? {
            price: Number(item.price),
            currency: item.currency as CurrencyCode,
            url: item.externalUrl,
          }
        : undefined,
    refUrl,
    labels,
  };
}

/**
 * S-04 수정 화면용 **원본 값** (D-157).
 *
 * ## ⚠️ `getItemDetail` 을 폼에 먹이면 안 된다
 * 그건 **표시용**이다. 수정 화면이 그걸 재사용하고 있었고 세 가지가 깨졌다:
 *
 * | 증상 | 원인 |
 * |---|---|
 * | `상태` 가 빈 값으로 리셋되고 저장 시 **지워진다** | D-155 로 `select` 값이 **라벨**("사용감 적음")이 됐다. `<select>` 의 `value` 는 옵션 **키**라 매칭 실패 |
 * | `포함 부속품` 이 하나도 선택 안 된 상태로 열린다 | 표시용은 `", "` 로 조인한다. 폼 구분자는 `;` 다 |
 * | **구매가가 저장할 때마다 사라진다** | 수정 화면이 `purchasedFrom`·`purchaseDate` 만 복사하고 `purchasePrice` 를 빠뜨렸다 |
 *
 * 앞의 둘은 표시 계층을 고칠 때마다 다시 터진다. **원본을 주는 경로를
 * 따로 두는 것**이 구조적인 해결이다 — 라벨·포맷을 거치지 않는다.
 *
 * ## ⚠️ 소유자만
 * 수정 화면은 소유자 전용이다 (FR-05-B-01, D-019). 없는 것과 남의 것을
 * 구분하지 않는다 (D-083).
 */
export async function getItemForEdit(
  itemId: string,
  viewer: Viewer,
): Promise<{
  categoryKey: string;
  /** 속성 key → 폼이 그대로 쓰는 문자열. 별칭은 `__nickname` */
  values: Record<string, string>;
  photos: string[];
} | null> {
  if (!viewer.roomId) return null;
  const item = await prisma.item.findFirst({
    where: { id: itemId, roomId: viewer.roomId },
    select: {
      nickname: true,
      category: {
        select: { key: true, matchingKey: { select: { attributeKeys: true } } },
      },
      photos: { select: { url: true }, orderBy: { displayOrder: "asc" } },
      attributeValues: {
        select: {
          value: true,
          categoryAttribute: {
            select: {
              active: true,
              attributeDefinition: { select: { key: true, type: true } },
            },
          },
        },
      },
    },
  });
  if (!item) return null;

  const values: Record<string, string> = {};
  for (const v of item.attributeValues) {
    // 비활성 속성은 폼에 칸이 없다 — 넣어도 쓰이지 않고 값은 보존된다 (D-036)
    if (!v.categoryAttribute.active) continue;
    const { key, type } = v.categoryAttribute.attributeDefinition;
    if (type === "multiselect") {
      // ⚠️ 배열 → **`;` 조인**. 폼·서버가 쓰는 구분자다 (D-157).
      // 각 원소를 한 번 더 쪼개는 이유: 옛 폼이 `,` 로 조인해 보내면
      // `["box,manual"]` 처럼 **한 덩어리로 저장된 값**이 남아 있을 수 있다
      const list = Array.isArray(v.value) ? v.value : [v.value];
      values[key] = list
        .flatMap((x) => String(x).split(/[;,]/))
        .map((x) => x.trim())
        .filter(Boolean)
        .join(";");
      continue;
    }
    if (typeof v.value === "boolean") {
      values[key] = v.value ? "true" : "false";
      continue;
    }
    values[key] = v.value === null || v.value === undefined ? "" : String(v.value);
  }
  // 별칭은 속성이 아니라 별개 컬럼이다 (D-112) — `__` 로 구분한다
  if (item.nickname) values.__nickname = item.nickname;

  return {
    categoryKey: item.category.key,
    values,
    // 스토리지 전 플레이스홀더는 없는 것으로 다룬다 (OI-47 잔재)
    photos: item.photos
      .map((p) => realPhotoUrl(p.url))
      .filter((u): u is string => !!u),
  };
}

/**
 * 조건부 색인 판정 (D-093).
 *
 * **판매중 + 아이템 공개 + 방 공개**일 때만 색인한다. 판매 의사가 없는
 * 소장품이 색인되면 D-031 절도 리스크를 아이템 단위로 다시 키운다.
 * 떠난 아이템(SOLD)도 제외한다 — 현재 보유자가 아니다 (D-023).
 */
export function isItemIndexable(item: {
  saleStatus: string;
  visibility: string;
  roomPublic: boolean;
}): boolean {
  return (
    item.saleStatus === "ON_SALE" &&
    item.visibility === "PUBLIC" &&
    item.roomPublic
  );
}

/** 사이트맵용 — 색인 대상 아이템 id (D-093, FR-02-A-01) */
export async function indexableItemIds(): Promise<string[]> {
  const rows = await prisma.item.findMany({
    where: {
      // ⚠️ **전시 단위 판정은 한 곳에서 온다** (D-211·D-221) — 조건을 여기 적지 않는다
      ...DISPLAYABLE_ITEM,
      saleStatus: "ON_SALE",
      visibility: "PUBLIC",
      room: { visibility: "PUBLIC", user: { deletedAt: null } },
    },
    select: { id: true },
    orderBy: { onSaleAt: { sort: "desc", nulls: "last" } },
    take: 5000,
  });
  return rows.map((r) => r.id);
}

/**
 * 루틴에 **추가할 수 있는 종목** 목록 (D-221, `FR-10-B-01·04·05`).
 *
 * ⚠️ **이미 이 루틴에 있는 것만 뺀다.** 다른 루틴에 속한 종목은 **그대로
 * 낸다** — M:N 이므로 여러 루틴에 들어가는 것이 정상이고(Q1), 거르면
 * "왜 이 종목이 목록에 없지"가 된다.
 *
 * ⚠️ **내 것만** 낸다 (`FR-10-B-04`). 루틴도 종목도 같은 방의 것이어야 한다.
 * 액션이 다시 검증하지만, 목록에 남의 것이 보이면 그 자체가 정보 노출이다.
 *
 * ⚠️ **루틴은 제외한다** (`FR-10-B-05`) — 루틴 안에 루틴은 없다.
 */
export async function getAddableExercises(
  routineId: string,
  viewer: Viewer | null,
): Promise<{ id: string; name: string }[]> {
  if (!viewer?.roomId) return [];

  const routine = await prisma.item.findFirst({
    where: { id: routineId, roomId: viewer.roomId },
    select: { categoryId: true },
  });
  if (!routine) return [];

  const rows = await prisma.item.findMany({
    where: {
      roomId: viewer.roomId,
      // 같은 카테고리 안에서만 구성이 성립한다 (E-10-04)
      categoryId: routine.categoryId,
      id: { not: routineId },
      // 루틴은 종목이 될 수 없다 (FR-10-B-05)
      subtype: { is: null },
      // 자전거 부품처럼 이미 다른 구성에 묶인 것은 제외한다 (D-211)
      parentId: null,
      // ⚠️ 이 루틴에 이미 있는 것만 뺀다 — 다른 루틴 소속은 그대로 낸다
      routineMemberships: { none: { routineItemId: routineId } },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, ...NAME_SELECT },
    take: 200,
  });
  return rows.map((r) => ({ id: r.id, name: deriveItemName(r) }));
}
