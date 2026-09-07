import { normalizeBrandToken } from "@/lib/brand-search";
import { specFieldsFor, writeCodexSpecs, type SpecField } from "@/lib/data/codex-spec";
import { visibleItemWhere } from "@/lib/data/scope";
import { prisma } from "@/lib/prisma";

/**
 * **유저 데이터로 스펙 추정** — 신뢰 모델 (D-312).
 *
 * ## ⚠️ 무엇을 푸는 문제인가
 * 조사가 스펙을 못 채운 도감이 남는다 (모델이 모르면 비우는 것이 규칙이다,
 * D-186). 그런데 **그 물건을 가진 유저들은 값을 적어 넣는다** — 같은 도감에
 * 걸린 아이템 여럿이 같은 케이스 지름을 적었다면 그것이 그 제품의 값이다.
 *
 * ## ⚠️ 다수결이지 평균이 아니다
 * 스펙은 사실상 **단일값**이다 (같은 레퍼런스면 지름이 하나다). 평균·중앙값을
 * 쓰면 **아무도 적지 않은 값**이 대표가 된다 — `40`·`42` 의 중앙값 `41` 은
 * 실재하지 않는 시계다. 최빈값을 쓰고, 갈리면 **내지 않는다.**
 *
 * ## ⚠️ 게이트가 이 기능의 핵심이다
 * 표본 1건짜리 오입력이 공용 사전에 오르면 그 물건을 가진 **모든 유저**에게
 * 틀린 값으로 보인다 (D-015). 그래서 표본 수와 일치율을 **둘 다** 본다:
 *
 * | 조건 | 값 | 왜 |
 * |---|---|---|
 * | 최소 표본 | **3** | 1~2건은 한 사람의 오타를 걸러낼 근거가 없다 |
 * | 최소 일치율 | **60%** | 3건 중 2건이 같으면 통과. 갈리면 값이 없는 편이 낫다 |
 * | 동률 | **버린다** | 40mm 2건 · 42mm 2건에서 어느 쪽도 대표가 아니다 |
 *
 * ## ⚠️ 표본은 **공개 아이템**만이다
 * 비공개는 유저가 감춘 데이터다 (D-019). 집계가 사람을 드러내지는 않지만,
 * 감춘 값을 재료로 쓰는 것 자체를 하지 않는다.
 *
 * ⚠️ 차단(D-051)은 보지 않는다 — 스펙은 **사람 정보가 아니라 제품의 사실**이라
 * 조회 유저마다 달라질 이유가 없다. 보유자 수와 다른 점이다 (FR-07-B-09).
 *
 * ⚠️ 판매완료·보관 아이템도 표본이다 — "지금 진열하지 않는다"는 값의 진위와
 * 무관하다.
 */

/** 이 값이 바뀌면 화면의 "보유자 N명 기준"이 뜻하는 신뢰도도 함께 바뀐다 */
export const DERIVE_MIN_SAMPLE = 3;
export const DERIVE_MIN_AGREEMENT = 0.6;

export type DeriveOutcome = {
  codexItemId: string;
  displayName: string;
  key: string;
  label: string;
  /** 최빈값의 원문. `decision === "write"` 일 때만 저장된다 */
  raw: string;
  sampleSize: number;
  agreement: number;
  decision: "write" | "gate" | "outranked" | "conflict";
  detail?: string;
};

/**
 * 버킷 키 구분자 — US(ASCII 31). 값에 섞일 수 없는 문자여야 한다
 * (`lib/codex-key.ts` 가 매칭 키에서 같은 이유로 같은 문자를 쓴다).
 */
const SEP = String.fromCharCode(31);

/**
 * 값 비교용 정규화 — **셀 때만 쓴다. 저장은 원문으로 한다.**
 *
 * ⚠️ `40` 과 `40.0` 은 같은 값이다. 문자열 그대로 세면 갈려서 게이트를 못 넘는다.
 * 반대로 저장까지 정규화하면 유저가 적은 표기를 잃는다.
 */
function countKey(type: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (type === "number") {
    const n = Number(String(value).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? String(n) : "";
  }
  if (Array.isArray(value)) return [...value.map(String)].sort().join(SEP);
  if (typeof value === "boolean") return String(value);
  // 대소문자·공백·하이픈 차이를 흡수한다 — 매칭·검색과 같은 규칙이다 (D-014)
  return normalizeBrandToken(String(value));
}

type Bucket = {
  codexItemId: string;
  displayName: string;
  categoryKey: string;
  subtypeKey: string | null;
  key: string;
  type: string;
  /** 정규화 키 → { 원문, 건수 } */
  counts: Map<string, { raw: unknown; n: number }>;
  total: number;
};

/**
 * 추정을 계산한다. `apply` 가 아니면 **쓰지 않고 결과만** 낸다 (D-185 태도).
 *
 * @param categoryKey 주면 그 카테고리만
 */
export async function deriveCodexSpecs(opts: {
  categoryKey?: string;
  apply: boolean;
}): Promise<DeriveOutcome[]> {
  const rows = await prisma.itemAttributeValue.findMany({
    where: {
      // D-036 — 비활성 속성은 값이 남아도 새로 채우지 않는다
      categoryAttribute: { active: true, attributeDefinition: { isSpec: true } },
      item: {
        codexItemId: { not: null },
        // 공개 아이템만 — 위 주석 참조. 차단은 보지 않는다
        ...visibleItemWhere([]),
        ...(opts.categoryKey
          ? { codexItem: { category: { key: opts.categoryKey } } }
          : {}),
      },
    },
    select: {
      value: true,
      item: {
        select: {
          codexItemId: true,
          codexItem: {
            select: {
              displayName: true,
              category: { select: { key: true } },
              subtype: { select: { key: true } },
            },
          },
        },
      },
      categoryAttribute: {
        select: { attributeDefinition: { select: { id: true, key: true, type: true } } },
      },
    },
  });

  const buckets = new Map<string, Bucket>();

  for (const r of rows) {
    const codexItemId = r.item.codexItemId;
    const codex = r.item.codexItem;
    if (!codexItemId || !codex) continue;
    const def = r.categoryAttribute.attributeDefinition;
    const ck = countKey(def.type, r.value);
    // 빈 값은 표본이 아니다 — 세면 "안 적음"이 대표값이 된다
    if (!ck) continue;

    const id = `${codexItemId}${SEP}${def.key}`;
    const b =
      buckets.get(id) ??
      ({
        codexItemId,
        displayName: codex.displayName,
        categoryKey: codex.category.key,
        subtypeKey: codex.subtype?.key ?? null,
        key: def.key,
        type: def.type,
        counts: new Map(),
        total: 0,
      } satisfies Bucket);
    const hit = b.counts.get(ck) ?? { raw: r.value, n: 0 };
    hit.n++;
    b.counts.set(ck, hit);
    b.total++;
    buckets.set(id, b);
  }

  /** 스코프별 스펙 목록은 도감마다 같다 — 한 번만 푼다 */
  const fieldCache = new Map<string, SpecField[]>();
  const fieldsOf = async (categoryKey: string, subtypeKey: string | null) => {
    const id = `${categoryKey}${SEP}${subtypeKey ?? ""}`;
    const hit = fieldCache.get(id);
    if (hit) return hit;
    // 어드민·배치 경로다 — ko 단일 (D-030)
    const made = await specFieldsFor({ categoryKey, subtypeKey, locale: "ko" });
    fieldCache.set(id, made);
    return made;
  };

  /** 이미 있는 값 — 더 센 출처를 덮지 않고, 어긋나면 알린다 */
  const existing = await prisma.codexAttributeValue.findMany({
    where: {
      codexItemId: { in: [...new Set([...buckets.values()].map((b) => b.codexItemId))] },
    },
    select: {
      codexItemId: true,
      source: true,
      value: true,
      attributeDefinition: { select: { key: true, type: true } },
    },
  });
  const existingBy = new Map(
    existing.map((e) => [`${e.codexItemId}${SEP}${e.attributeDefinition.key}`, e]),
  );

  const out: DeriveOutcome[] = [];

  for (const [id, b] of buckets) {
    const fields = await fieldsOf(b.categoryKey, b.subtypeKey);
    const field = fields.find((f) => f.key === b.key);
    // 스코프 밖 속성 — 종류가 바뀐 도감에서 생긴다. 값은 두되 새로 만들지 않는다
    if (!field) continue;

    const sorted = [...b.counts.entries()].sort((a, c) => c[1].n - a[1].n);
    const [, top] = sorted[0];
    const tie = sorted.length > 1 && sorted[1][1].n === top.n;
    const agreement = top.n / b.total;

    const base = {
      codexItemId: b.codexItemId,
      displayName: b.displayName,
      key: b.key,
      label: field.label,
      raw: String(top.raw),
      sampleSize: b.total,
      agreement,
    };

    if (b.total < DERIVE_MIN_SAMPLE) {
      out.push({
        ...base,
        decision: "gate",
        detail: `표본 ${b.total}건 (최소 ${DERIVE_MIN_SAMPLE})`,
      });
      continue;
    }
    if (tie) {
      out.push({ ...base, decision: "gate", detail: "최빈값이 동률입니다" });
      continue;
    }
    if (agreement < DERIVE_MIN_AGREEMENT) {
      out.push({
        ...base,
        decision: "gate",
        detail: `일치율 ${Math.round(agreement * 100)}% (최소 ${Math.round(
          DERIVE_MIN_AGREEMENT * 100,
        )}%)`,
      });
      continue;
    }

    const have = existingBy.get(id);
    if (have && have.source !== "DERIVED") {
      /*
        ⚠️ **어긋나면 알린다.** 조사·운영이 넣은 값과 유저 다수가 적은 값이
        다르면 둘 중 하나가 틀린 것이다 — 도감 오류를 잡아낼 유일한 신호이고,
        조용히 넘기면 그 신호가 사라진다. 자동으로 고치지는 않는다 (D-185 태도)
      */
      const same = countKey(b.type, have.value) === countKey(b.type, top.raw);
      out.push({
        ...base,
        decision: same ? "outranked" : "conflict",
        detail: same
          ? `이미 ${have.source} 값이 있습니다`
          : `${have.source} 값 "${String(have.value)}" 과 다릅니다`,
      });
      continue;
    }

    if (opts.apply) {
      await writeCodexSpecs({
        codexItemId: b.codexItemId,
        fields,
        values: { [b.key]: top.raw },
        source: "DERIVED",
        // 화면이 이 숫자를 말한다 — "보유자 N명 기준"
        derived: { sampleSize: b.total, agreement: top.n },
      });
    }
    out.push({ ...base, decision: "write" });
  }

  return out;
}
