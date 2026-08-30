import { prisma } from "@/lib/prisma";
import {
  ATTRIBUTE_SCOPE_ORDER,
  attributeScopeWhere,
  resolveMatchingKeyOrder,
} from "@/lib/subtype";

/**
 * 봇이 채울 항목 목록과 **값 정제** (D-153).
 *
 * ## ⚠️ 항목을 코드에 박지 않는다
 * 카테고리마다 속성 조합이 다르고(A-02, D-118) 어드민이 런타임에 바꾼다.
 * 목록을 코드에 박으면 조합을 바꾼 순간 프롬프트가 거짓말을 한다 — D-135 에서
 * 라벨을 코드에 박아 **유령 키 4개**가 생긴 것과 같은 실패다.
 *
 * ## ⚠️ `createItemAs` 는 값을 타입 검증하지 않는다
 * 필수 여부와 브랜드 마스터 참조만 본다. `select` 옵션 키·날짜 형식·숫자 여부는
 * **아무도 안 본다** — 잘못된 값이 그대로 저장되고 화면에서 라벨을 못 찾는다.
 * 사람이 채우는 폼에서는 `<select>` 가 그 역할을 했지만 **모델은 무엇이든
 * 쓴다.** 그래서 정제를 여기서 한다.
 */
export type BotField = {
  key: string;
  /** DB 의 `AttributeType` */
  type: string;
  required: boolean;
  /** 어드민 화면은 ko 전용이다 (D-030) */
  label: string;
  options: { key: string; label: string }[];
  /** 매칭 키 구성 속성인가 — 지어내면 가짜 도감이 생긴다 (D-015) */
  isMatchingKey: boolean;
};

/** 카테고리의 활성 속성 + 매칭 키 구성 (표시 순서 그대로) */
/**
 * 봇 프롬프트용 속성 select — 카테고리 경로와 종류 경로가 **같은 모양**이어야
 * 두 결과를 같은 map 으로 처리할 수 있다.
 */
const ATTRIBUTE_SELECT = {
  required: true,
  // 카테고리별 라벨 override (D-168) — 봇 프롬프트도 같은 이름을 봐야 한다
  labelKo: true,
  attributeDefinition: {
    select: {
      key: true,
      type: true,
      labelKo: true,
      options: {
        where: { active: true },
        orderBy: { displayOrder: "asc" },
        // D-209 — `null` 이면 공통, 값이면 그 카테고리 전용
        select: { key: true, labelKo: true, categoryId: true },
      },
    },
  },
} as const;

export async function categoryFields(
  categoryKey: string,
  /**
   * D-253 — 종류를 주면 **공통 + 그 종류 전용**을 합쳐 내고, 매칭 키도 종류 것을
   * 우선한다. 비우면 종전과 같다(카테고리 공통만).
   *
   * ⚠️ 규칙을 여기서 다시 쓰지 않는다 — `lib/subtype.ts` 의 `attributeScopeWhere`
   * 와 `resolveMatchingKeyOrder` 를 그대로 쓴다. 봇이 자기 규칙을 들면 등록 폼과
   * 갈리고, **봇이 만든 도감을 유저 등록이 못 찾는다** (D-190·D-197 과 같은 실패).
   */
  subtypeKey?: string | null,
): Promise<BotField[]> {
  const category = await prisma.category.findUnique({
    where: { key: categoryKey },
    select: {
      id: true,
      matchingKey: { select: { attributeKeys: true } },
      attributes: {
        where: { active: true },
        orderBy: { displayOrder: "asc" },
        select: ATTRIBUTE_SELECT,
      },
    },
  });
  if (!category) return [];

  /*
    D-253 — 종류를 받았으면 속성·매칭 키를 그 축으로 다시 푼다.
    `subtype.ts` 가 두 규칙의 단일 출처다
  */
  let rows = category.attributes;
  let keyOrder = category.matchingKey?.attributeKeys ?? ["uniqueId"];

  if (subtypeKey) {
    const st = await prisma.categorySubtype.findUnique({
      where: { categoryId_key: { categoryId: category.id, key: subtypeKey } },
      select: { id: true },
    });
    if (!st) return [];
    rows = await prisma.categoryAttribute.findMany({
      where: attributeScopeWhere({ categoryId: category.id, subtypeId: st.id }),
      orderBy: ATTRIBUTE_SCOPE_ORDER,
      select: ATTRIBUTE_SELECT,
    });
    keyOrder = await resolveMatchingKeyOrder({ categoryId: category.id, subtypeId: st.id });
  }

  // 매칭 키 정의가 없으면 `uniqueId` 가 기본이다 — `createItemAs` 와 같은 기준
  const keys = new Set(keyOrder.length > 0 ? keyOrder : ["uniqueId"]);

  return rows.map((a) => {
    const d = a.attributeDefinition;
    return {
      key: d.key,
      type: d.type,
      required: a.required,
      label: a.labelKo ?? d.labelKo,
      /*
        D-209 — **이 카테고리에서 안 쓰는 선택지를 뺀다.** 봇도 입력 경로다 —
        프롬프트에 `여분 링크` 가 있으면 모델이 캠핑 아이템에 그것을 넣는다
      */
      options: d.options
        .filter((o) => o.categoryId === null || o.categoryId === category.id)
        .map((o) => ({ key: o.key, label: o.labelKo })),
      isMatchingKey: keys.has(d.key),
    };
  });
}

/** 프롬프트에 넣을 항목 표 — 모델이 이 표만 보고 JSON 을 만든다 */
export function fieldsTable(fields: BotField[]): string {
  const rows = fields
    // ⚠️ 브랜드는 넣지 않는다. 마스터 참조라 어드민이 골라야 하고(D-043),
    // 모델이 고른 이름은 "목록에서 브랜드를 선택해주세요" 로 막힌다 (D-150)
    .filter((f) => f.key !== "brand")
    .map((f) => {
      const kind = TYPE_LABEL[f.type] ?? f.type;
      const extra = f.options.length
        ? ` 허용 키: \`${f.options.map((o) => o.key).join("` `")}\``
        : "";
      /**
       * ⚠️ **엄격한 항목과 채워야 하는 항목을 표에서 구분한다.**
       * 초판은 표에 "모르면 비운다"만 강조했더니 모델이 상태·부속품·제조년도까지
       * 전부 비웠다 — 시딩이 목적인데 빈 아이템이 나왔다. 실제 위험은 **매칭
       * 키에만** 있다 (지어내면 가짜 도감이 생긴다, D-015). 나머지는 틀려도
       * 그 아이템 하나에서 끝나므로 **채우는 쪽이 맞다.**
       */
      const note =
        f.isMatchingKey && f.required
          ? // ⚠️ **매칭 키인데 필수인 경우**가 있다 (운동의 `model` — 종목명이
            // 곧 매칭 키다, D-166). 여기에 "비운다"를 안내하면 **비워서 등록이
            // 막힌다.** 필수는 비울 수 없으므로 "확실한 값을 쓴다"로 갈린다
            " **고유값 · 필수 — 비울 수 없다. 확실히 아는 값만 쓴다**"
          : f.isMatchingKey
            ? " **고유값 · 엄격 — 확실하지 않으면 반드시 비운다**"
            : f.type === "url"
              ? " 비워둔다"
              : " 반드시 채운다";
      return `| \`${f.key}\` | ${f.label} | ${kind} |${note}${extra} |`;
    });
  return ["| 키 | 항목 | 형식 | 비고 |", "|---|---|---|---|", ...rows].join("\n");
}

const TYPE_LABEL: Record<string, string> = {
  text: "짧은 글",
  textarea: "설명",
  number: "숫자",
  date: "날짜",
  select: "선택",
  multiselect: "다중선택",
  url: "링크",
  boolean: "예/아니오",
};

/** 모델이 따라 쓸 JSON 골격 */
export function jsonSkeleton(fields: BotField[]): string {
  const entries = fields
    .filter((f) => f.key !== "brand")
    .map((f) => `"${f.key}":${f.type === "multiselect" ? "[]" : '""'}`);
  return `{${entries.join(",")}}`;
}

/* ────────────────────────────────────────────
   도감 자료 조사 (A-04, D-185)
   ──────────────────────────────────────────── */

/**
 * 매칭 키 구성 속성만 — 도감이 필요한 값은 이것뿐이다.
 *
 * ⚠️ **아이템 조사와 필터가 정반대다.** `fieldsTable` 은 `brand` 를 **빼지만**
 * (마스터 참조라 어드민이 고른다, D-043) 도감은 `brand` 가 매칭 키의 일부다
 * (자전거 = 브랜드+모델명+제조년도). 빼면 키가 만들어지지 않는다.
 */
export function matchingKeyFields(fields: BotField[]): BotField[] {
  return fields.filter((f) => f.isMatchingKey);
}

/** 도감 프롬프트에 넣을 식별 값 목록 */
export function codexKeyList(fields: BotField[]): string {
  return matchingKeyFields(fields)
    .map((f) => {
      const kind = TYPE_LABEL[f.type] ?? f.type;
      return `- \`${f.key}\` — **${f.label}** (${kind})`;
    })
    .join("\n");
}

/**
 * 도감 후보 1건의 JSON 골격. 설명은 받지 않는다 (FR-07-A-05, 프롬프트 메모 참조).
 *
 * ⚠️ `names` 는 **표시용 언어별 명칭**이다 (D-276·D-278). `displayName`(원문)과
 * 다르고, **비어 오는 것이 정상**이라 식별 값과 달리 없다고 행을 버리지 않는다
 */
export function codexJsonSkeleton(fields: BotField[]): string {
  const entries = matchingKeyFields(fields).map((f) => `"${f.key}":""`);
  return `{"displayName":"","names":{"en":"","ko":"","ja":""},${entries.join(",")}}`;
}

/** 조사된 도감 후보 — 어드민이 화면에서 고치고 등록한다 */
export type CodexCandidate = {
  displayName: string;
  keyValues: Record<string, string>;
  /**
   * 표시용 언어별 명칭 (D-278). **없는 것이 정상이다** — 라틴 원문은 채울
   * 이유가 없고(D-009·D-277), 모델이 확신 없으면 비워야 한다.
   *
   * ⚠️ **식별 값이 아니다.** 비어도 행을 버리지 않는다
   */
  names: { ko?: string; ja?: string; en?: string };
};

/**
 * 모델이 낸 배열을 **등록 가능한 후보**로 만든다.
 *
 * ⚠️ **식별 값이 하나라도 비면 그 행을 버린다.** 아이템 조사는 비면 도감을 안
 * 만들고 넘어가면 됐지만(D-032), 도감은 **키가 없으면 존재 의미가 없다** —
 * 어떤 아이템에도 연결되지 않는 빈 껍데기가 된다 (FR-04-A-04).
 *
 * ⚠️ **배치 안의 중복도 여기서 버린다.** 같은 키가 두 번 오면 두 번째는 DB
 * 유니크에서 막히는데, 그러면 어드민 화면에 "이미 있는 도감입니다"가 떠서
 * **직전에 자기가 만든 것인지 원래 있던 것인지 구분할 수 없다.**
 */
export function sanitizeCodexCandidates(
  fields: BotField[],
  rows: unknown[],
): { candidates: CodexCandidate[]; dropped: string[] } {
  const parts = matchingKeyFields(fields);
  const candidates: CodexCandidate[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      dropped.push("객체가 아닌 항목");
      continue;
    }
    const r = row as Record<string, unknown>;
    const name = typeof r.displayName === "string" ? r.displayName.trim() : "";
    if (!name) {
      dropped.push("명칭 없음");
      continue;
    }

    /*
      ⚠️ 표시명은 **있으면 받고 없으면 만다** (D-278). 식별 값과 달리 비어도
      행을 버리지 않는다 — 도감 1,113건 중 1,002건이 비어 있는 것이 정상이고,
      "채우라고 압박하면 지어낸다" 가 D-185 가 겪은 실패다
    */
    const rawNames = (r.names ?? {}) as Record<string, unknown>;
    const names: CodexCandidate["names"] = {};
    for (const lang of ["ko", "ja", "en"] as const) {
      const v = rawNames[lang];
      const text = typeof v === "string" ? v.trim() : "";
      // 원문과 같은 값을 표시명으로 받아봐야 의미가 없다 — 어차피 원문으로 떨어진다
      if (text && text !== name) names[lang] = text;
    }

    const keyValues: Record<string, string> = {};
    let missing = "";
    for (const p of parts) {
      const v = r[p.key];
      const text = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
      if (!text) missing = p.label;
      keyValues[p.key] = text;
    }
    if (missing) {
      dropped.push(`${name} — ${missing} 없음`);
      continue;
    }

    /*
      ⚠️ **`고유번호` 는 제조사가 부여한 값이어야 한다 — 명칭에서 만든 값을 막는다.**

      실제로 겪었다(D-185 시딩): 레퍼런스 번호가 없는 시계 브랜드에서 모델이
      `baltic-aquascaphe-dual-crown` 같은 **슬러그를 지어냈다.** 형식만 그럴싸해서
      프롬프트의 "확실하지 않으면 내지 않는다"를 통과했다.

      두 가지로 판정한다:
      1. 정규화한 고유번호가 **명칭과 같다** → 명칭을 식별자로 쓴 것이다
      2. **숫자가 하나도 없다** → 레퍼런스 번호·스타일 코드에는 항상 숫자가 있다

      ⚠️ **`uniqueId` 항목에만 적용한다.** 운동의 매칭 키는 `model`(운동명)이고
      그것은 명칭과 같은 것이 정상이다 (D-166) — 모든 키에 걸면 운동이 전멸한다.
    */
    const uid = keyValues.uniqueId;
    if (uid !== undefined) {
      const flat = (v: string) => v.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
      if (flat(uid) === flat(name)) {
        dropped.push(`${name} — 고유번호가 명칭과 같습니다 (제조사 값이 아닙니다)`);
        continue;
      }
      if (!/\d/.test(uid)) {
        dropped.push(`${name} — 고유번호에 숫자가 없습니다 ("${uid}")`);
        continue;
      }
    }

    // 화면에 그대로 붙는 값이다. 상한이 없으면 표가 깨진다
    if (name.length > 200) {
      dropped.push(`${name.slice(0, 30)}… — 명칭이 너무 깁니다`);
      continue;
    }

    // 순서를 고정해 비교한다 — 정규화는 서버가 `buildMatchingKey` 로 다시 한다
    const dedupe = parts.map((p) => keyValues[p.key].toLowerCase()).join("\u001f");
    if (seen.has(dedupe)) {
      dropped.push(`${name} — 이번 조사 안에서 중복`);
      continue;
    }
    seen.add(dedupe);
    candidates.push({ displayName: name, keyValues, names });
  }

  return { candidates, dropped };
}

/** 정제 결과 — 무엇이 버려졌는지 어드민에게 보여준다 */
export type Sanitized = {
  values: Record<string, string>;
  /** 버린 항목과 이유. 조용히 버리면 왜 빈칸인지 알 수 없다 */
  dropped: string[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** `note` 는 textarea 다. 상한이 DB validation 에 없으므로 여기서 자른다 */
const TEXT_MAX = 1000;

/**
 * 모델 응답을 **저장 가능한 값**으로 만든다.
 *
 * 버리는 쪽으로 판단한다 — 애매한 값을 통과시키면 화면에서 깨지거나(옵션 키)
 * 가짜 도감이 된다(고유값). 빈칸은 어드민이 채울 수 있다.
 */
export function sanitize(
  fields: BotField[],
  raw: Record<string, unknown>,
  today: string,
  /**
   * ⚠️ **모델 응답에서는 링크를 버린다** (기본값). 어드민이 손으로 넣은 값은
   * 사람이 확인한 것이므로 받는다 — 지어낸 링크와 붙여넣은 링크를 구분한다.
   */
  opts: { allowUrls?: boolean } = {},
): Sanitized {
  const values: Record<string, string> = {};
  const dropped: string[] = [];
  const drop = (f: BotField, why: string) => dropped.push(`${f.label}: ${why}`);

  for (const f of fields) {
    if (f.key === "brand") continue; // 어드민이 고른다 (D-043)
    const v = raw[f.key];
    if (v === undefined || v === null) continue;

    if (f.type === "multiselect") {
      // 배열로 오길 기대하지만 문자열로 오는 경우도 받는다
      const list = Array.isArray(v)
        ? v.map(String)
        : String(v)
            .split(/[;,]/)
            .map((s) => s.trim());
      const valid = list.filter((x) => f.options.some((o) => o.key === x));
      const bad = list.filter(
        (x) => x && !f.options.some((o) => o.key === x),
      );
      if (bad.length) drop(f, `허용되지 않는 값 ${bad.join(", ")}`);
      // ⚠️ `createItemAs` 가 `;` 로 쪼개 배열로 저장한다 — 구분자를 맞춘다
      if (valid.length) values[f.key] = valid.join(";");
      continue;
    }

    const s = String(v).trim();
    if (!s) continue;

    switch (f.type) {
      case "select": {
        // 키로 왔으면 그대로, 라벨로 왔으면 키로 바꾼다
        const hit =
          f.options.find((o) => o.key === s) ??
          f.options.find((o) => o.label === s);
        if (!hit) {
          drop(f, `허용되지 않는 값 "${s}"`);
          continue;
        }
        values[f.key] = hit.key;
        break;
      }
      case "number": {
        // 쉼표·단위가 섞여 오는 경우가 흔하다
        const n = Number(s.replace(/[^\d.-]/g, ""));
        if (!Number.isFinite(n)) {
          drop(f, `숫자가 아님 "${s}"`);
          continue;
        }
        values[f.key] = String(n);
        break;
      }
      case "date": {
        if (!ISO_DATE.test(s)) {
          drop(f, `날짜 형식 아님 "${s}"`);
          continue;
        }
        // ⚠️ 미래 구매일은 받지 않는다 — 모델이 곧잘 올해 말 날짜를 쓴다
        if (s > today) {
          drop(f, `미래 날짜 "${s}"`);
          continue;
        }
        values[f.key] = s;
        break;
      }
      case "url": {
        // 프롬프트에서 만들지 말라고 했지만 오면 걸러낸다. 지어낸 링크는
        // 없는 것보다 나쁘다 — 외부 링크는 경고까지 붙는다 (D-040)
        if (!opts.allowUrls) {
          drop(f, "링크는 지어내지 않습니다");
          continue;
        }
        if (!/^https:\/\/\S+$/.test(s)) {
          drop(f, `https 링크가 아님 "${s}"`);
          continue;
        }
        values[f.key] = s;
        break;
      }
      case "boolean": {
        values[f.key] = s === "true" || s === "예" ? "true" : "false";
        break;
      }
      default:
        values[f.key] = s.slice(0, TEXT_MAX);
    }
  }
  return { values, dropped };
}
