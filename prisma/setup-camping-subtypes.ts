import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * 캠핑에 `조리도구`·`물병` 종류를 추가한다 (D-258).
 *
 * ## ⚠️ 왜 이 둘인가 — 데이터가 정했다
 * 캠핑 도감 208건을 분류하니 `unknown` 84건이 나왔는데, 뜯어보니 **오염보다
 * "종류가 없어서" 가 두 배 많았다.** 조리도구 13건(Lodge 더치오븐·스킬렛,
 * Petromax, 밥통) · 물병 9건(Hydro Flask · Stanley) 이 갈 곳이 없었다.
 *
 * **높은 `unknown` 은 데이터 오염이 아니라 분류 체계의 공백 신호였다.**
 *
 * ## ⚠️ 배낭은 여기 넣지 않는다 (D-259)
 * 배낭 24건은 전부 백패킹 팩이고 **등산 카테고리**로 간다. 캠핑·등산 양쪽에
 * 두면 `Item.categoryId` 가 단일 FK 라 스코프가 갈려 **같은 배낭이 두 도감**이
 * 된다 — D-207 이 종류 단위에서 경고한 실패의 카테고리판이다.
 *
 * ## ⚠️ 속성 정의를 새로 만들지 않는다
 * `capacityLiters`(용량 L) 는 쿨러가 이미 쓴다. 공통 라이브러리(D-010)의
 * 목적이 재사용이다 — 같은 개념에 키를 하나 더 만들면 번역도 두 벌이 된다.
 *
 * ```
 * pnpm tsx prisma/setup-camping-subtypes.ts          # 미리보기
 * pnpm tsx prisma/setup-camping-subtypes.ts --apply
 * ```
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes("--apply");

/** 재사용: 이미 있는 정의를 그대로 붙인다. 신규: 정의부터 만든다 */
type AttrSpec =
  | { key: string; reuse: true }
  | {
      key: string;
      reuse?: false;
      type: "text" | "number" | "select" | "boolean";
      labelKo: string;
      labelJa: string;
      labelEn: string;
      unitKo?: string;
      unitJa?: string;
      unitEn?: string;
      /** `[key, ko, ja, en]` */
      options?: [string, string, string, string][];
    };

type SubtypeSpec = {
  key: string;
  labelKo: string;
  labelJa: string;
  labelEn: string;
  displayOrder: number;
  attrs: AttrSpec[];
};

/** 새 종류. `displayOrder` 는 기존 0~7 뒤에 붙인다 */
const SUBTYPES: SubtypeSpec[] = [
  {
    key: "cookware",
    labelKo: "조리도구",
    labelJa: "調理器具",
    labelEn: "Cookware",
    displayOrder: 8,
    /** 이 종류에만 붙는 속성. `key` 가 이미 있으면 그 정의를 재사용한다 */
    attrs: [
      { key: "cookwareMaterial", type: "select", labelKo: "재질", labelJa: "素材", labelEn: "Material",
        options: [
          ["castIron", "주철", "鋳鉄", "Cast iron"],
          ["stainless", "스테인리스", "ステンレス", "Stainless steel"],
          ["aluminum", "알루미늄", "アルミ", "Aluminum"],
          ["titanium", "티타늄", "チタン", "Titanium"],
        ] },
      { key: "servesCount", type: "number", labelKo: "인분", labelJa: "人前", labelEn: "Serves",
        unitKo: "인", unitJa: "人", unitEn: "servings" },
      // 재사용 — 쿨러가 이미 쓴다
      { key: "capacityLiters", reuse: true },
    ],
  },
  {
    key: "bottle",
    labelKo: "물병",
    labelJa: "ボトル",
    labelEn: "Bottle",
    displayOrder: 9,
    attrs: [
      { key: "capacityLiters", reuse: true },
      { key: "insulated", type: "boolean", labelKo: "보온·보냉", labelJa: "保温・保冷", labelEn: "Insulated" },
    ],
  },
];

async function main() {
  console.log(`대상 DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}`);
  console.log(APPLY ? "모드: 적용\n" : "모드: 미리보기 (--apply 로 적용)\n");

  const camping = await prisma.category.findUnique({
    where: { key: "camping" },
    select: { id: true },
  });
  if (!camping) throw new Error("캠핑 카테고리가 없습니다");

  for (const st of SUBTYPES) {
    const existing = await prisma.categorySubtype.findUnique({
      where: { categoryId_key: { categoryId: camping.id, key: st.key } },
      select: { id: true },
    });
    if (existing) {
      console.log(`· ${st.labelKo}: 이미 있음`);
      continue;
    }
    if (!APPLY) {
      console.log(`· ${st.labelKo}: 생성 예정 (속성 ${st.attrs.length}개)`);
      continue;
    }

    const made = await prisma.categorySubtype.create({
      data: {
        categoryId: camping.id,
        key: st.key,
        labelKo: st.labelKo,
        labelJa: st.labelJa,
        labelEn: st.labelEn,
        displayOrder: st.displayOrder,
      },
      select: { id: true },
    });

    for (let i = 0; i < st.attrs.length; i++) {
      const a = st.attrs[i];
      let defId: string;
      if (a.reuse) {
        const found = await prisma.attributeDefinition.findUnique({
          where: { key: a.key },
          select: { id: true },
        });
        if (!found) throw new Error(`재사용하려는 속성 '${a.key}' 가 없습니다`);
        defId = found.id;
      } else {
        const def = await prisma.attributeDefinition.upsert({
          where: { key: a.key },
          update: {},
          create: {
            key: a.key,
            type: a.type,
            // ⚠️ 유저에게 보이므로 3개 언어 필수 (D-010)
            labelKo: a.labelKo,
            labelJa: a.labelJa,
            labelEn: a.labelEn,
            ...(a.unitKo ? { unitKo: a.unitKo, unitJa: a.unitJa, unitEn: a.unitEn } : {}),
            isCommon: false,
          },
          select: { id: true },
        });
        defId = def.id;
        if (a.options) {
          for (let j = 0; j < a.options.length; j++) {
            const [k, ko, ja, en] = a.options[j];
            await prisma.attributeOption.upsert({
              where: { attributeDefinitionId_key: { attributeDefinitionId: defId, key: k } },
              update: {},
              // ⚠️ 선택지 번역 누락이 가장 흔하다 (policies/i18n §3)
              create: {
                attributeDefinitionId: defId,
                key: k,
                labelKo: ko,
                labelJa: ja,
                labelEn: en,
                displayOrder: j,
              },
            });
          }
        }
      }

      /*
        ⚠️ **종류 전용 행이다** — `categoryId` 를 넣지 않는다 (카테고리 XOR 제품군).
        공통에 이미 있는 속성을 종류에 또 붙이면 등록 폼에 두 번 그려진다 (D-252).
      */
      await prisma.categoryAttribute.create({
        data: { subtypeId: made.id, attributeDefinitionId: defId, displayOrder: i },
      });
    }
    console.log(`· ${st.labelKo}: 생성함 (속성 ${st.attrs.length}개)`);
  }

  if (APPLY) {
    const all = await prisma.categorySubtype.count({ where: { categoryId: camping.id } });
    console.log(`\n캠핑 종류 ${all}개`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
