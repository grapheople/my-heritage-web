import { prisma } from "@/lib/prisma";

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
export async function categoryFields(categoryKey: string): Promise<BotField[]> {
  const category = await prisma.category.findUnique({
    where: { key: categoryKey },
    select: {
      id: true,
      matchingKey: { select: { attributeKeys: true } },
      attributes: {
        where: { active: true },
        orderBy: { displayOrder: "asc" },
        select: {
          required: true,
          attributeDefinition: {
            select: {
              key: true,
              type: true,
              labelKo: true,
              options: {
                where: { active: true },
                orderBy: { displayOrder: "asc" },
                select: { key: true, labelKo: true },
              },
            },
          },
        },
      },
    },
  });
  if (!category) return [];

  // 매칭 키 정의가 없으면 `uniqueId` 가 기본이다 — `createItemAs` 와 같은 기준
  const keys = new Set(category.matchingKey?.attributeKeys ?? ["uniqueId"]);

  return category.attributes.map((a) => {
    const d = a.attributeDefinition;
    return {
      key: d.key,
      type: d.type,
      required: a.required,
      label: d.labelKo,
      options: d.options.map((o) => ({ key: o.key, label: o.labelKo })),
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
      const note = f.isMatchingKey
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
  // 별칭은 속성이 아니라 `Item.nickname` 이다 — 따로 요청한다 (D-112)
  return `{${entries.join(",")},"nickname":""}`;
}

/** 정제 결과 — 무엇이 버려졌는지 어드민에게 보여준다 */
export type Sanitized = {
  values: Record<string, string>;
  nickname: string;
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

  const nickname = String(raw.nickname ?? "").trim().slice(0, 30);
  return { values, nickname, dropped };
}
