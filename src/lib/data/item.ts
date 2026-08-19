import type { Prisma } from "@/generated/prisma/client";
import type {
  CodexAttr,
  ItemDetail,
  RoutineEntryView,
  RoutineSettings,
} from "@/lib/data/types";
import type { Viewer } from "@/lib/auth/viewer";
import type { CurrencyCode } from "@/lib/format";
import { blockedUserIds } from "@/lib/data/scope";
import { realPhotoUrl } from "@/lib/data/photo";
import { levelOf } from "@/lib/data/level";
import { deriveItemName, NAME_SELECT } from "@/lib/data/item-name";
import type { Locale } from "@/i18n/routing";
import { pickAttrLabel, pickCategoryAttrLabel, pickLabel } from "@/lib/data/label";
import { normalizeBrandToken } from "@/lib/brand-search";
import { prisma } from "@/lib/prisma";
import { DISPLAYABLE_ITEM } from "@/lib/item-display";
import { muscleOrder, musclesOfRoutine, sortMuscleKeys } from "@/lib/data/muscles";
import { WORKOUT_CATEGORY } from "@/lib/categories";

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

/**
 * 관계 행 → **내 설정** (D-227 `FR-10-B-04`).
 *
 * ⚠️ **빈 값은 키 자체를 넣지 않는다.** `null` 을 넘기면 화면이 "중량: -" 처럼
 * 빈 항목을 렌더할 여지가 생긴다 — 7종 전부 선택이라(`FR-10-B-06`) 대부분 비어
 * 있는 것이 정상이고, 없는 것은 **없는 것으로** 내려보낸다.
 *
 * ⚠️ `Decimal` 은 **문자열로** 바꾼다. 클라이언트 컴포넌트 경계를 넘을 수 없고
 * 표시는 어차피 문자열이다. `toString()` 이 `100` / `2.5` 를 그대로 낸다
 */
function routineSettingsOf(r: {
  reps: string[];
  restSeconds: number | null;
  workingWeight: Prisma.Decimal | null;
  rpe: Prisma.Decimal | null;
  tempo: string | null;
  machineSetting: string | null;
}): RoutineSettings {
  // ⚠️ `reps` 는 **항상 배열**이다 (빈 배열 포함) — 세트 수가 배열 길이다 (D-236)
  const out: RoutineSettings = { reps: r.reps };
  if (r.restSeconds !== null) out.restSeconds = String(r.restSeconds);
  if (r.workingWeight !== null) out.weight = r.workingWeight.toString();
  if (r.rpe !== null) out.rpe = r.rpe.toString();
  if (r.tempo) out.tempo = r.tempo;
  if (r.machineSetting) out.machineSetting = r.machineSetting;
  return out;
}

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
        D-227 — **루틴이 담은 운동 + 내 설정.** 순서가 곧 내용이므로
        `displayOrder` 로 정렬한다. 자극부위는 이 목록에서 **계산**한다
        (FR-10-D-01·02).

        ⚠️ 운동명은 **마스터의 도감**에서 온다 (`CodexItem.displayName`) —
        아이템 명칭 파생(D-073)을 쓰지 않는다. 운동은 아이템이 아니다
      */
      routineEntries: {
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          kind: true,
          reps: true,
          restSeconds: true,
          workingWeight: true,
          rpe: true,
          tempo: true,
          machineSetting: true,
          restDurationSeconds: true,
          exercise: {
            select: {
              id: true,
              targetMuscles: true,
              active: true,
              codexItem: { select: { id: true, displayName: true } },
            },
          },
        },
      },
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

  /*
    자극부위 표시 순서 (`FR-10-D-03`) — **화면당 한 번만 읽는다.**
    행마다 읽으면 담긴 운동 수만큼 쿼리가 붙는다
  */
  const muscleOrderMap = await muscleOrder();

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
      D-227 — 루틴 구성. **빈 배열이면 운동 0개인 루틴**이고, 그 상태는 루틴을
      만든 직후 반드시 거친다 (E-10-01) — `isRoutine` 과 구분해야 화면이
      "운동을 담아보세요"를 낼 수 있다.

      ⚠️ **운동 카테고리의 아이템은 루틴뿐이다** (`FR-10-A-01`). 제품군으로
      가르지 않고 카테고리로 판정한다 — 제품군 `routine` 은 폐기됐다
      (`FR-10-A-08`)
    */
    isRoutine: item.category.key === WORKOUT_CATEGORY,
    /*
      D-236 — 운동과 휴식이 섞인 **항목 목록**이다. 순서가 곧 내용이므로
      `displayOrder` 정렬을 그대로 낸다.

      ⚠️ **휴식은 `exercise` 가 `null`** 이다. `kind` 로 가르되 `exercise` 유무도
      함께 본다 — `kind` 가 `EXERCISE` 인데 마스터가 지워진 행이 남으면(FK 는
      Cascade 라 이론상 없다) 그 행을 조용히 운동으로 렌더하지 않는다
    */
    entries: item.routineEntries.flatMap((r): RoutineEntryView[] => {
      if (r.kind === "REST") {
        // 0 이하는 파서가 막지만, 옛 데이터·직접 수정을 만나면 렌더하지 않는다
        return r.restDurationSeconds && r.restDurationSeconds > 0
          ? [{ kind: "REST", id: r.id, seconds: r.restDurationSeconds }]
          : [];
      }
      if (!r.exercise) return [];
      return [
        {
          kind: "EXERCISE",
          id: r.id,
          exerciseId: r.exercise.id,
          name: r.exercise.codexItem.displayName,
          muscles: sortMuscleKeys(r.exercise.targetMuscles, muscleOrderMap),
          codexId: r.exercise.codexItem.id,
          inactive: !r.exercise.active,
          settings: routineSettingsOf(r),
        },
      ];
    }),
    /** 근육맵 입력 — 담긴 운동 `targetMuscles` 의 합집합 (FR-10-D-01) */
    muscles: musclesOfRoutine(item.routineEntries, muscleOrderMap),
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
 * 내 설정 7종의 **라벨과 단위** (D-227, D-135 의 원칙 유지).
 *
 * ## ⚠️ 왜 메시지 파일에 넣지 않는가
 * 이 7개는 D-166 이 만든 **공통 속성 라이브러리 항목**이고 `labelKo/Ja/En` 과
 * `unitKo/Ja/En` 이 이미 DB 에 있다. 메시지 파일에 문구를 새로 박으면 같은 값이
 * 두 곳에 생기고, 어드민이 A-02 에서 이름을 바꿨을 때 **폼과 상세가 다르게
 * 부른다** — D-135 가 겪은 자리다(`attr.color` 를 못 찾아 화면이 터졌다).
 *
 * ## ⚠️ 단위가 없으면 값이 거짓말한다
 * "세트 사이 휴식: 180" 은 초인지 분인지 알 수 없다 — D-166 이 아이템 상세에서
 * 겪고 고친 문제다. `number` 성격 항목에만 단위를 붙인다.
 *
 * ⚠️ 이 7개는 D-227 이후 **`CategoryAttribute` 에 연결돼 있지 않다**(관계 행의
 * 컬럼이 됐다). 그래서 카테고리 override(D-168)가 아니라 `AttributeDefinition`
 * 을 직접 읽는다.
 */
export async function getRoutineFieldLabels(
  locale: Locale,
): Promise<Record<string, { label: string; unit?: string }>> {
  const KEYS = [
    "sets",
    "repsPerSet",
    "restSeconds",
    "workingWeight",
    "rpe",
    "tempo",
    "machineSetting",
  ];
  const defs = await prisma.attributeDefinition.findMany({
    where: { key: { in: KEYS } },
    select: {
      key: true,
      labelKo: true,
      labelJa: true,
      labelEn: true,
      unitKo: true,
      unitJa: true,
      unitEn: true,
    },
  });
  const out: Record<string, { label: string; unit?: string }> = {};
  for (const d of defs) {
    out[d.key] = {
      label: pickAttrLabel(locale, d),
      unit:
        pickLabel(locale, { ko: d.unitKo, ja: d.unitJa, en: d.unitEn }) || undefined,
    };
  }
  /*
    ⚠️ **없는 키는 키 이름으로 대체한다.** 시드가 안 돌았거나 속성이 지워졌을 때
    폼이 빈 라벨로 뜨면 무엇을 입력하는 칸인지 알 수 없다 (D-174 의 태도)
  */
  for (const k of KEYS) out[k] ??= { label: k };
  return out;
}

/**
 * 루틴에 **담을 수 있는 운동**을 마스터에서 찾는다 (D-227 `FR-10-B-09`).
 *
 * ## ⚠️ 유저 아이템을 뒤지지 않는다
 * D-221 때는 "내 종목 목록"이었다. 지금 운동은 **어드민 마스터**이므로 전역
 * 목록을 검색한다 — 소유 판정할 대상이 없다 (`FR-10-B-04` 폐기).
 *
 * ⚠️ **이미 이 루틴에 있는 것은 뺀다** (`FR-10-B-03`). 다른 루틴에 있는 것은
 * **그대로 낸다** — 같은 운동을 여러 루틴에 담는 것이 정상이고(`FR-10-B-01`)
 * 거르면 "왜 이 운동이 목록에 없지"가 된다.
 *
 * ⚠️ **비활성 운동은 제외한다** (`FR-11-C-07`). 이미 담긴 루틴에서는 유지되지만
 * (`FR-10-B-08`) 새로 담을 후보로는 내지 않는다.
 *
 * ⚠️ **검색은 운동명 + alias 를 본다** (D-009). `벤치` 로 `바벨 벤치프레스` 가
 * 걸려야 한다 — alias 가 없으면 유저는 정식 명칭을 알아야만 찾을 수 있다.
 */
export async function searchExercisesForRoutine(input: {
  /**
   * ⚠️ **선택이다** (D-236). 등록 폼에는 아직 루틴이 **없다** — 그때는 제외할
   * 대상도 없으므로 전체를 낸다. 중복은 화면이 들고 있는 목록으로 막는다.
   */
  routineId?: string;
  viewer: Viewer | null;
  /** 검색어. 비어 있으면 최근 등록된 운동을 낸다 (첫 화면이 비지 않게) */
  q?: string;
  locale: Locale;
}): Promise<{ id: string; name: string; muscles: string[]; codexId: string }[]> {
  /*
    ⚠️ **로그인은 요구한다.** 마스터 목록 자체는 도감에 공개되지만(`FR-11-C-01`),
    이 경로는 검색어를 받는 액션이라 비로그인에 열어두면 **긁어가는 엔드포인트**가
    된다. 목록을 보려면 도감 화면을 쓰면 된다
  */
  if (!input.viewer?.roomId) return [];

  // 루틴이 주어졌으면 **내 것인지** 확인한다 — 목록 자체는 전역이라 정보 노출이 아니다
  if (input.routineId) {
    const routine = await prisma.item.findFirst({
      where: { id: input.routineId, roomId: input.viewer.roomId },
      select: { id: true },
    });
    if (!routine) return [];
  }

  const [rows, order] = await Promise.all([
    prisma.exercise.findMany({
      where: {
        active: true,
        // 이 루틴에 이미 담긴 것만 제외 (FR-10-B-03). 루틴이 없으면 제외도 없다
        ...(input.routineId
          ? { entries: { none: { routineItemId: input.routineId } } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: MASTER_SCAN_LIMIT,
      select: {
        id: true,
        targetMuscles: true,
        codexItem: { select: { id: true, displayName: true, aliases: true } },
      },
    }),
    muscleOrder(),
  ]);

  const nq = normalizeBrandToken(input.q ?? "");
  /*
    검색어가 없으면 최근 등록 순으로 낸다 — **첫 화면을 비우지 않는다.** 빈 목록은
    "마스터가 비었나"로 읽힌다 (E-11-01 과 구분되어야 한다)
  */
  const picked = nq
    ? rank(rows, nq).slice(0, SEARCH_LIMIT)
    : rows.slice(0, SEARCH_LIMIT);

  return picked.map((r) => ({
    id: r.id,
    name: r.codexItem.displayName,
    muscles: sortMuscleKeys(r.targetMuscles, order),
    codexId: r.codexItem.id,
  }));
}

/** 마스터 전수를 읽는 상한. 목표 규모가 80~120건이라(D-232) 여유가 크다 */
const MASTER_SCAN_LIMIT = 500;
/** 화면에 내는 개수 */
const SEARCH_LIMIT = 50;

type ExerciseRow = {
  id: string;
  targetMuscles: string[];
  codexItem: { id: string; displayName: string; aliases: unknown };
};

/**
 * 정규화 랭킹 — **도감 검색(`searchCodex`)과 같은 방식**이다 (D-014).
 *
 * ## ⚠️ `aliases` 를 DB 조건으로 밀 수 없다 — 실측으로 확인했다
 * 초판은 `aliases: { string_contains: q }` 를 썼다. **동작하지 않았다** —
 * `string_contains` 는 Json 이 **문자열일 때만** 매칭하고, 우리 `aliases` 는
 * `{"en":["Bench Press"],"ja":[…]}` 형태의 **객체**다. 에러도 나지 않고 조용히
 * 0건이었다: `bench` 로 검색해도 `바벨 벤치프레스` 가 나오지 않았다.
 *
 * 정규화 비교 자체도 DB 로 밀 수 없다(`displayName` 에 정규화 컬럼이 없다).
 * 그래서 후보를 읽어 **애플리케이션에서 랭킹한다** — `searchCodex` 가 이미 그
 * 구조다. 마스터가 80~120건이라 비용이 문제되지 않는다.
 *
 * 랭크가 낮을수록 앞: 이름 완전일치 → alias 완전일치 → 이름 접두 → alias 접두 →
 * 부분일치.
 */
function rank(rows: readonly ExerciseRow[], nq: string): ExerciseRow[] {
  const scored: { row: ExerciseRow; r: number }[] = [];
  for (const row of rows) {
    const name = normalizeBrandToken(row.codexItem.displayName);
    const aliases = aliasStrings(row.codexItem.aliases).map((a) => normalizeBrandToken(a));
    if (name === nq) scored.push({ row, r: 0 });
    else if (aliases.includes(nq)) scored.push({ row, r: 1 });
    else if (name.startsWith(nq)) scored.push({ row, r: 2 });
    else if (aliases.some((a) => a.startsWith(nq))) scored.push({ row, r: 3 });
    else if (name.includes(nq)) scored.push({ row, r: 4 });
    else if (aliases.some((a) => a.includes(nq))) scored.push({ row, r: 5 });
  }
  scored.sort(
    (a, b) => a.r - b.r || a.row.codexItem.displayName.localeCompare(b.row.codexItem.displayName),
  );
  return scored.map((s) => s.row);
}

/** `CodexItem.aliases`(언어별 배열)를 평평하게 (D-009) */
function aliasStrings(aliases: unknown): string[] {
  if (!aliases || typeof aliases !== "object") return [];
  const a = aliases as Record<string, unknown>;
  return (["ko", "ja", "en"] as const).flatMap((k) =>
    Array.isArray(a[k]) ? (a[k] as unknown[]).filter((v): v is string => typeof v === "string") : [],
  );
}
