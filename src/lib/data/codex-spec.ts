import type { Locale } from "@/i18n/routing";
import { displayValue, optionLabel } from "@/lib/data/attr-format";
import { pickCategoryAttrLabel, pickLabel } from "@/lib/data/label";
import { prisma } from "@/lib/prisma";
import { ATTRIBUTE_SCOPE_ORDER, attributeScopeWhere } from "@/lib/subtype";

/**
 * **도감 스펙** — 제품 고유 값을 도감이 갖는다 (D-312).
 *
 * ## ⚠️ 이 파일이 스펙 규칙의 단일 출처다
 * 어떤 속성이 스펙인지(`isSpec`), 값을 어떻게 검사·저장하는지, 출처가 어떻게
 * 경쟁하는지가 전부 여기 있다. 조사 스크립트·어드민 폼·추정 배치가 **같은
 * 함수**를 부른다 — 규칙을 각자 들면 조용히 갈린다 (D-190·D-197·D-270).
 *
 * ## ⚠️ 스펙은 도감을 **가르지 않는다**
 * 매칭 키와 다른 축이다 (D-291). 케이스 지름으로 도감을 나누면 같은 시계가
 * 흩어진다. 여기 있는 값은 **표시·비교용**이고 매칭에 쓰이지 않는다.
 *
 * ## 출처 우선순위 — `ADMIN` > `RESEARCH` > `DERIVED`
 * 사람이 확인한 값이 가장 세고, 유저 데이터 추정이 가장 약하다. **추정이
 * 조사값을 덮지 않는다** — 덮으면 확인된 값이 표본 몇 개에 밀린다.
 */

/** 우선순위 — 숫자가 클수록 세다. 비교를 한 곳에 둔다 */
const RANK = { ADMIN: 3, RESEARCH: 2, DERIVED: 1 } as const;
export type SpecSource = keyof typeof RANK;

/** 스펙 1종의 입력 규격 — 조사 프롬프트·어드민 폼이 함께 쓴다 */
export type SpecField = {
  definitionId: string;
  key: string;
  /** DB 의 `AttributeType` */
  type: string;
  label: string;
  /** `number` 만. 없으면 빈 문자열 */
  unit: string;
  options: { key: string; label: string }[];
};

const SPEC_SELECT = {
  labelKo: true,
  labelJa: true,
  labelEn: true,
  displayOrder: true,
  attributeDefinition: {
    select: {
      id: true,
      key: true,
      type: true,
      labelKo: true,
      labelJa: true,
      labelEn: true,
      unitKo: true,
      unitJa: true,
      unitEn: true,
      options: {
        where: { active: true },
        orderBy: { displayOrder: "asc" as const },
        select: { key: true, labelKo: true, labelJa: true, labelEn: true },
      },
    },
  },
} as const;

/**
 * 이 스코프에서 도감이 가질 수 있는 스펙 목록.
 *
 * ⚠️ **스코프 규칙을 다시 쓰지 않는다** — 등록 폼과 같은 `attributeScopeWhere`
 * 를 쓴다 (카테고리 공통 ∪ 그 종류 전용, D-207·D-253). 규칙이 갈리면 등록
 * 폼에 있는 속성이 도감에는 없는 상태가 조용히 생긴다.
 *
 * ⚠️ **비활성 속성은 빠진다** (D-036) — 값은 보존되지만 새로 채우지 않는다.
 */
export async function specFieldsFor(input: {
  categoryKey: string;
  subtypeKey?: string | null;
  locale: Locale;
}): Promise<SpecField[]> {
  const category = await prisma.category.findUnique({
    where: { key: input.categoryKey },
    select: { id: true },
  });
  if (!category) return [];
  const subtype = input.subtypeKey
    ? await prisma.categorySubtype.findUnique({
        where: { categoryId_key: { categoryId: category.id, key: input.subtypeKey } },
        select: { id: true },
      })
    : null;

  const rows = await prisma.categoryAttribute.findMany({
    where: {
      ...attributeScopeWhere({ categoryId: category.id, subtypeId: subtype?.id }),
      // D-312 — 스펙만. 개인 값(구매가·상태)은 도감에 올리지 않는다
      attributeDefinition: { isSpec: true },
    },
    orderBy: ATTRIBUTE_SCOPE_ORDER,
    select: SPEC_SELECT,
  });

  return rows.map((ca) => {
    const d = ca.attributeDefinition;
    return {
      definitionId: d.id,
      key: d.key,
      type: d.type,
      // 카테고리별 override 를 우선한다 (D-168)
      label: pickCategoryAttrLabel(input.locale, ca),
      // 단위는 `number` 에만 의미가 있다 (D-038) — 나머지는 빈 문자열이다
      unit:
        d.type === "number"
          ? pickLabel(input.locale, { ko: d.unitKo, ja: d.unitJa, en: d.unitEn })
          : "",
      options: d.options.map((o) => ({
        key: o.key,
        label:
          pickLabel(input.locale, { ko: o.labelKo, ja: o.labelJa, en: o.labelEn }) || o.key,
      })),
    };
  });
}

/** 화면에 뿌릴 스펙 한 줄 */
export type CodexSpec = {
  key: string;
  label: string;
  /** 단위까지 붙은 표시 문자열 */
  value: string;
  source: SpecSource;
  /** `DERIVED` 일 때만 — 화면이 "보유자 N명 기준"으로 말한다 */
  sampleSize?: number;
  agreement?: number;
};

/**
 * 도감의 스펙 값 — **표시용**.
 *
 * ⚠️ **비활성·스코프 밖 속성은 내지 않는다.** 종류가 바뀌면(D-309 임포트) 옛
 * 종류 전용 스펙이 값으로 남아 있을 수 있다 — 값은 지우지 않지만 화면에는
 * 안 낸다 (D-036 이 속성에 취한 태도와 같다).
 */
export async function getCodexSpecs(
  codexId: string,
  locale: Locale,
): Promise<CodexSpec[]> {
  const codex = await prisma.codexItem.findUnique({
    where: { id: codexId },
    select: {
      category: { select: { key: true } },
      subtype: { select: { key: true } },
      specValues: {
        select: {
          value: true,
          source: true,
          sampleSize: true,
          agreement: true,
          attributeDefinition: { select: { id: true, key: true } },
        },
      },
    },
  });
  if (!codex || codex.specValues.length === 0) return [];

  const fields = await specFieldsFor({
    categoryKey: codex.category.key,
    subtypeKey: codex.subtype?.key ?? null,
    locale,
  });
  const out: CodexSpec[] = [];
  // 표시 순서는 **속성 순서**를 따른다 — 저장 순서로 두면 도감마다 뒤죽박죽이다
  for (const f of fields) {
    const v = codex.specValues.find(
      (s) => s.attributeDefinition.id === f.definitionId,
    );
    if (!v) continue;
    const raw =
      f.type === "select" || f.type === "multiselect"
        ? optionLabel(
            locale,
            // 라벨 맵을 다시 만들지 않고 필드가 이미 푼 것을 쓴다
            f.options.map((o) => ({
              key: o.key,
              labelKo: o.label,
              labelJa: o.label,
              labelEn: o.label,
            })),
            v.value,
          )
        : displayValue(v.value);
    if (!raw) continue;
    out.push({
      key: f.key,
      label: f.label,
      value: f.unit && f.type === "number" ? `${raw} ${f.unit}` : raw,
      source: v.source,
      sampleSize: v.sampleSize ?? undefined,
      agreement: v.agreement ?? undefined,
    });
  }
  return out;
}

/**
 * 값 검사·정규화 — **저장 모양은 `ItemAttributeValue` 와 같다** (number 는
 * 문자열로 담아 정밀도를 보존한다). 두 곳이 다른 모양이면 추정 집계가 어긋난다.
 *
 * @returns `null` 이면 그 값은 버린다 (사유는 호출부가 모은다)
 */
export function coerceSpecValue(
  field: SpecField,
  raw: unknown,
): { value: unknown } | { error: string } {
  const text = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";

  if (field.type === "number") {
    /*
      ⚠️ **단위가 붙어 오는 것을 받아준다.** 조사 모델은 `40mm`·`300 m` 처럼
      낸다. 숫자만 떼고 나머지가 단위 문자면 통과시킨다 — 거절만 하면 값이
      있는데 버려지고, 아무거나 통과시키면 `약 40` 이 40 이 된다
    */
    const m = /^(-?\d+(?:\.\d+)?)\s*([a-zA-Z°℃㎡%가-힣]*)$/.exec(text);
    if (!m) return { error: `숫자가 아닙니다: ${text}` };
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return { error: `숫자가 아닙니다: ${text}` };
    // 저장은 문자열 — `ItemAttributeValue` 와 같은 모양이다
    return { value: m[1] };
  }

  if (field.type === "boolean") {
    const yes = ["true", "yes", "y", "예", "있음", "はい"];
    const no = ["false", "no", "n", "아니오", "없음", "いいえ"];
    const low = text.toLowerCase();
    if (typeof raw === "boolean") return { value: raw };
    if (yes.includes(low)) return { value: true };
    if (no.includes(low)) return { value: false };
    return { error: `참/거짓이 아닙니다: ${text}` };
  }

  if (field.type === "select" || field.type === "multiselect") {
    const list = Array.isArray(raw)
      ? raw.map((v) => String(v).trim())
      : text
        ? text.split(",").map((v) => v.trim())
        : [];
    const keys: string[] = [];
    for (const v of list) {
      if (!v) continue;
      /*
        ⚠️ **라벨로 와도 키로 바꿔 저장한다.** 조사 모델은 `알루미늄` 처럼
        라벨을 낸다 — 그대로 저장하면 화면이 라벨을 못 찾아 그 문자열이 그대로
        보이고, 옵션 이름을 바꾸는 순간 값이 고아가 된다 (D-155)
      */
      const hit =
        field.options.find((o) => o.key === v) ??
        field.options.find((o) => o.label === v);
      if (!hit) return { error: `선택지에 없습니다: ${v}` };
      keys.push(hit.key);
    }
    if (keys.length === 0) return { error: "값 없음" };
    return { value: field.type === "multiselect" ? keys : keys[0] };
  }

  if (!text) return { error: "값 없음" };
  // text·textarea·url·date — 저장값이 곧 표시값이다
  return { value: text.slice(0, 200) };
}

export type SpecWriteResult = {
  written: number;
  /** 왜 안 들어갔는지 — 조용히 넘기지 않는다 (D-188 의 교훈) */
  skipped: string[];
};

/**
 * 스펙 값을 쓴다.
 *
 * ## ⚠️ 더 약한 출처가 더 센 값을 덮지 않는다
 * `RESEARCH` 는 `ADMIN` 을 못 덮고, `DERIVED` 는 둘 다 못 덮는다. 같은 등급은
 * 덮는다 — 재조사·재추정이 갱신으로 동작해야 한다.
 *
 * ⚠️ **빈 값은 `ADMIN` 만 지울 수 있다.** 조사·추정이 빈 값을 보내는 것은
 * "모른다"이지 "지워라"가 아니다 (`import-brands`·D-309 와 같은 규칙).
 */
export async function writeCodexSpecs(input: {
  codexItemId: string;
  fields: SpecField[];
  /** 속성 key → 값. 없는 키는 건드리지 않는다 */
  values: Record<string, unknown>;
  source: SpecSource;
  derived?: { sampleSize: number; agreement: number };
}): Promise<SpecWriteResult> {
  const out: SpecWriteResult = { written: 0, skipped: [] };
  const byKey = new Map(input.fields.map((f) => [f.key, f]));

  const existing = await prisma.codexAttributeValue.findMany({
    where: { codexItemId: input.codexItemId },
    select: { attributeDefinitionId: true, source: true },
  });
  const rank = new Map(existing.map((e) => [e.attributeDefinitionId, RANK[e.source]]));

  for (const [key, raw] of Object.entries(input.values)) {
    const field = byKey.get(key);
    if (!field) {
      out.skipped.push(`${key} — 이 스코프의 스펙이 아닙니다`);
      continue;
    }

    const empty =
      raw === null ||
      raw === undefined ||
      (typeof raw === "string" && raw.trim() === "") ||
      (Array.isArray(raw) && raw.length === 0);

    const have = rank.get(field.definitionId) ?? 0;
    if (have > RANK[input.source]) {
      out.skipped.push(`${key} — 더 확실한 값이 이미 있습니다`);
      continue;
    }

    if (empty) {
      // 조사·추정의 빈 값은 "모른다" 다 — 지우지 않는다
      if (input.source !== "ADMIN") continue;
      await prisma.codexAttributeValue.deleteMany({
        where: { codexItemId: input.codexItemId, attributeDefinitionId: field.definitionId },
      });
      out.written++;
      continue;
    }

    const coerced = coerceSpecValue(field, raw);
    if ("error" in coerced) {
      out.skipped.push(`${key} — ${coerced.error}`);
      continue;
    }

    const data = {
      value: coerced.value as never,
      source: input.source,
      sampleSize: input.source === "DERIVED" ? (input.derived?.sampleSize ?? null) : null,
      agreement: input.source === "DERIVED" ? (input.derived?.agreement ?? null) : null,
      derivedAt: input.source === "DERIVED" ? new Date() : null,
    };
    await prisma.codexAttributeValue.upsert({
      where: {
        codexItemId_attributeDefinitionId: {
          codexItemId: input.codexItemId,
          attributeDefinitionId: field.definitionId,
        },
      },
      create: { codexItemId: input.codexItemId, attributeDefinitionId: field.definitionId, ...data },
      update: data,
    });
    out.written++;
  }
  return out;
}

/**
 * 어드민 스펙 편집기가 쓰는 묶음 — **필드 + 현재 값 + 출처** (D-312).
 *
 * ⚠️ 값을 **원문 그대로** 낸다 (표시 문자열이 아니다). 폼이 되돌려 보낼 값이라
 * 단위가 붙거나 옵션 라벨로 바뀌면 저장할 때 다시 파싱해야 한다 — 그 왕복에서
 * 값이 상한다.
 */
export async function getCodexSpecEditor(codexId: string): Promise<{
  fields: SpecField[];
  values: Record<string, { raw: string; list: string[]; source: SpecSource; sampleSize?: number }>;
}> {
  const codex = await prisma.codexItem.findUnique({
    where: { id: codexId },
    select: {
      category: { select: { key: true } },
      subtype: { select: { key: true } },
      specValues: {
        select: {
          value: true,
          source: true,
          sampleSize: true,
          attributeDefinition: { select: { key: true } },
        },
      },
    },
  });
  if (!codex) return { fields: [], values: {} };

  const fields = await specFieldsFor({
    categoryKey: codex.category.key,
    subtypeKey: codex.subtype?.key ?? null,
    // 어드민은 ko 단일이다 (D-030)
    locale: "ko",
  });

  const values: Record<
    string,
    { raw: string; list: string[]; source: SpecSource; sampleSize?: number }
  > = {};
  for (const v of codex.specValues) {
    const list = Array.isArray(v.value) ? v.value.map(String) : [];
    values[v.attributeDefinition.key] = {
      raw: Array.isArray(v.value) ? "" : displayValue(v.value),
      list,
      source: v.source,
      sampleSize: v.sampleSize ?? undefined,
    };
  }
  return { fields, values };
}
