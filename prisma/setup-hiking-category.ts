import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * 등산 카테고리 신설 (D-259).
 *
 * ## ⚠️ 카테고리는 어드민에서 만들 수 없다 — 스크립트로만 (D-007)
 * 카테고리마다 **매칭 키·속성 조합·도감 체계**가 딸려 있어 임의로 추가하면
 * 그 셋이 비어 있는 카테고리가 생긴다. 셋을 함께 만드는 스크립트로 한다 —
 * `setup-workout-category.ts` 가 선례다 (D-166).
 *
 * ## ⚠️ 이 스크립트만으로 끝나지 않는다
 * 세 가지를 **손으로** 더 해야 한다:
 * 1. `src/lib/categories.ts` 의 `CATEGORY_KEYS` 에 `hiking` — 코드 배열이다 (OI-82).
 *    빠뜨리면 등록 폼·온보딩·브랜드 요청 등 **선택 UI 8곳에 안 나온다** (D-166)
 * 2. `messages/{ko,ja,en}.json` 의 `category.hiking` — 3개 언어 (D-010)
 * 3. `BrandScope` — Osprey·Gregory·Deuter·Mammut 등 연결. 없으면 브랜드 게이트에
 *    막혀 도감이 하나도 안 들어간다 (D-043·D-044)
 *
 * ## ⚠️ 왜 배낭이 캠핑이 아니라 여기인가
 * `Item.categoryId` 는 단일 FK 다. 양쪽에 두면 스코프가 갈려 **같은 배낭이 두
 * 도감**이 된다 — D-207 이 종류 단위에서 경고한 실패의 카테고리판이다.
 * 데이터도 이 구분을 지지한다: 배낭 24건이 전부 백패킹 팩이다
 * (Hyperlite·Zpacks 는 스루하이킹 전용 브랜드).
 *
 * ## ⚠️ 종류를 2개로 시작한다
 * 스틱·아이젠·헤드램프는 **지금 도감이 0건**이다. 없는 것에 종류를 만들면
 * 유저 폼에 빈 선택지가 뜬다 — D-207 의 "없는 것이 기본" 과 같은 태도.
 *
 * ## ⚠️ `subtypeRequired` 를 켜지 않는다
 * 이관 전에는 종류 스코프에 도감이 없어 D-257 과 같은 중복 생성이 일어난다.
 * 이관이 끝난 뒤 켠다.
 *
 * ```
 * pnpm tsx prisma/setup-hiking-category.ts          # 미리보기
 * pnpm tsx prisma/setup-hiking-category.ts --apply
 * ```
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes("--apply");

/**
 * 공통 속성 — **전부 기존 정의를 재사용한다.** 캠핑과 같은 골격이다.
 * 새 키를 만들면 번역이 두 벌이 된다 (D-010).
 */
const COMMON: { key: string; required?: boolean }[] = [
  { key: "brand" },
  { key: "model", required: true },
  { key: "color" },
  { key: "condition" },
  { key: "accessories" },
  { key: "purchaseDate" },
  { key: "purchasedFrom" },
  { key: "purchasePrice" },
  { key: "referenceUrl" },
  { key: "note" },
];

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
      options?: [string, string, string, string][];
    };

const SUBTYPES: {
  key: string;
  labelKo: string;
  labelJa: string;
  labelEn: string;
  displayOrder: number;
  attrs: AttrSpec[];
}[] = [
  {
    key: "backpack",
    labelKo: "배낭",
    labelJa: "バックパック",
    labelEn: "Backpack",
    displayOrder: 0,
    attrs: [
      // 재사용 — 쿨러·조리도구가 이미 쓴다
      { key: "capacityLiters", reuse: true },
      // 재사용 — 자전거 프레임·휠셋·안장, 캠핑 텐트·침낭 등이 쓴다
      { key: "minWeight", reuse: true },
      {
        key: "torsoSize",
        type: "select",
        labelKo: "등판 길이",
        labelJa: "背面長",
        labelEn: "Torso size",
        options: [
          ["s", "S", "S", "S"],
          ["m", "M", "M", "M"],
          ["l", "L", "L", "L"],
          ["adjustable", "조절식", "調節式", "Adjustable"],
        ],
      },
    ],
  },
  {
    key: "climbing",
    labelKo: "등반장비",
    labelJa: "クライミング用品",
    labelEn: "Climbing gear",
    displayOrder: 1,
    attrs: [
      {
        key: "climbingGearType",
        type: "select",
        labelKo: "장비 종류",
        labelJa: "用品タイプ",
        labelEn: "Gear type",
        options: [
          ["rope", "로프", "ロープ", "Rope"],
          ["harness", "하네스", "ハーネス", "Harness"],
          ["helmet", "헬멧", "ヘルメット", "Helmet"],
          ["belay", "확보기", "ビレイデバイス", "Belay device"],
          ["beacon", "비콘", "ビーコン", "Beacon"],
          ["other", "기타", "その他", "Other"],
        ],
      },
      { key: "minWeight", reuse: true },
    ],
  },
];

async function findDef(key: string) {
  const d = await prisma.attributeDefinition.findUnique({ where: { key }, select: { id: true } });
  if (!d) throw new Error(`속성 정의 '${key}' 가 없습니다 — 재사용 전제가 깨졌습니다`);
  return d.id;
}

async function main() {
  console.log(`대상 DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}`);
  console.log(APPLY ? "모드: 적용\n" : "모드: 미리보기 (--apply 로 적용)\n");

  const existing = await prisma.category.findUnique({
    where: { key: "hiking" },
    select: { id: true },
  });
  if (existing) {
    console.log("등산 카테고리: 이미 있음");
  } else if (!APPLY) {
    console.log(`등산 카테고리: 생성 예정`);
    console.log(`  공통 속성 ${COMMON.length}개 (전부 재사용)`);
    for (const s of SUBTYPES) console.log(`  종류 ${s.labelKo} — 속성 ${s.attrs.length}개`);
    console.log(`  매칭 키 [brand, model]`);
    console.log(`\n⚠️ 적용 후 손으로 할 것: CATEGORY_KEYS · messages 3개 언어 · BrandScope`);
    return;
  }

  const category =
    existing ??
    (await prisma.category.create({
      data: {
        key: "hiking",
        // 캠핑(4) 다음. 운동은 6 이다
        displayOrder: 5,
        // 등산 장비는 중고 거래가 활발하다 — 막을 이유가 없다
        sellable: true,
        // 기본값 유지 — 사진 1장 필수 (D-224)
        requiresPhoto: true,
        // 유저 등록이 도감을 만든다 — 캠핑과 같다 (운동만 예외, D-231)
        userCodexCreation: true,
        // ⚠️ 이관 전에는 켜지 않는다 (D-257)
        subtypeRequired: false,
      },
      select: { id: true },
    }));

  // ── 공통 속성 ─────────────────────────────────────────────────────────
  for (let i = 0; i < COMMON.length; i++) {
    const c = COMMON[i];
    const defId = await findDef(c.key);
    await prisma.categoryAttribute.upsert({
      where: { categoryId_attributeDefinitionId: { categoryId: category.id, attributeDefinitionId: defId } },
      update: {},
      create: {
        categoryId: category.id,
        attributeDefinitionId: defId,
        required: c.required ?? false,
        displayOrder: i,
      },
    });
  }
  console.log(`공통 속성 ${COMMON.length}개 연결`);

  // ── 종류 + 전용 속성 ──────────────────────────────────────────────────
  for (const st of SUBTYPES) {
    const made = await prisma.categorySubtype.upsert({
      where: { categoryId_key: { categoryId: category.id, key: st.key } },
      update: {},
      create: {
        categoryId: category.id,
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
        defId = await findDef(a.key);
      } else {
        const def = await prisma.attributeDefinition.upsert({
          where: { key: a.key },
          update: {},
          create: {
            key: a.key,
            type: a.type,
            labelKo: a.labelKo,
            labelJa: a.labelJa,
            labelEn: a.labelEn,
            ...(a.unitKo ? { unitKo: a.unitKo, unitJa: a.unitJa, unitEn: a.unitEn } : {}),
            isCommon: false,
          },
          select: { id: true },
        });
        defId = def.id;
        for (let j = 0; j < (a.options?.length ?? 0); j++) {
          const [k, ko, ja, en] = a.options![j];
          await prisma.attributeOption.upsert({
            where: { attributeDefinitionId_key: { attributeDefinitionId: defId, key: k } },
            update: {},
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
      await prisma.categoryAttribute.upsert({
        where: { subtypeId_attributeDefinitionId: { subtypeId: made.id, attributeDefinitionId: defId } },
        update: {},
        // ⚠️ 종류 전용 행 — `categoryId` 를 넣지 않는다 (카테고리 XOR 제품군)
        create: { subtypeId: made.id, attributeDefinitionId: defId, displayOrder: i },
      });
    }
    console.log(`종류 ${st.labelKo} — 속성 ${st.attrs.length}개`);
  }

  // ── 매칭 키 ───────────────────────────────────────────────────────────
  /*
    ⚠️ **캠핑과 같은 `brand+model`** 이다. 등산 장비는 시계·신발 같은 고유 ID
    체계가 없다. 비워두면 `insertCodex` 가 전부 거부한다 (A-03 미구성).
  */
  await prisma.matchingKeyDefinition.upsert({
    where: { categoryId: category.id },
    update: {},
    create: { categoryId: category.id, attributeKeys: ["brand", "model"] },
  });
  console.log("매칭 키 [brand, model]");

  console.log(`\n⚠️ 아직 손으로 할 것이 남았다:`);
  console.log(`  1. src/lib/categories.ts 의 CATEGORY_KEYS 에 "hiking" (OI-82)`);
  console.log(`  2. messages/{ko,ja,en}.json 의 category.hiking`);
  console.log(`  3. BrandScope — 등산 브랜드 연결 (없으면 도감이 안 들어간다)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
