import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  describeDatabase,
  migrationDatabaseUrl,
  pgSslConfig,
  stripSslMode,
} from "../src/lib/db-url";

/**
 * 등산 종류 확장 — 신발·스틱·의상(레이어별) (D-299).
 *
 * D-259 가 만든 등산은 `배낭`·`등반장비` 둘뿐이었다. PM 지시로 **입는 것**과
 * **스틱**을 채운다.
 *
 * ## ⚠️ 의상은 **레이어**로 가른다 — 품목이 아니라
 * 아웃도어 의류는 "재킷·티셔츠"가 아니라 **베이스 → 미드 → 인슐레이션 → 셸**
 * 로 겹쳐 입는 축이 실제 사용 방식이다. 품목명으로 가르면 같은 플리스가
 * "재킷"과 "미드레이어"에 동시에 걸린다.
 *
 * **인슐레이션을 미드에서 뗀 이유**: 다운재킷은 미드로도 아우터로도 입어서
 * 3분류(베이스·미드·셸)에서는 판정이 흔들린다. 따로 두면 "충전재가 있는가"
 * 라는 물리적 기준으로 갈린다 — 그래서 `fillType`·`fillPower` 를 침낭에서
 * 그대로 재사용할 수 있다.
 *
 * **`등산바지`는 레이어가 아니다.** 레이어 축은 상의를 겹쳐 입는 이야기라
 * 하의를 덮지 못한다. 별도 종류로 둔다.
 *
 * ## ⚠️ 속성은 최대한 재사용한다 (D-010)
 * `size`·`minWeight`·`fillType`·`fillPower` 는 기존 정의를 그대로 쓴다. 새 키를
 * 만들면 번역이 두 벌이 되고, 나중에 한쪽만 고쳐진다.
 *
 * `size` 는 옷·신발에 **카테고리 공통**으로 붙어 있는데(등산에는 없다) 여기서는
 * **종류 전용**으로 붙인다 — 배낭·스틱에는 사이즈 칸이 필요 없기 때문이다.
 *
 * ## ⚠️ 표시 순서를 다시 매긴다
 * `장비(배낭·스틱·등반) → 신발 → 의류(레이어 순) → 하의`. 등반장비가 1번에
 * 있었는데 2번으로 밀린다 — 유저가 고르는 화면의 순서라 의미 단위로 묶는다.
 *
 * ```
 * pnpm tsx prisma/setup-hiking-subtypes.ts          # 미리보기
 * pnpm tsx prisma/setup-hiking-subtypes.ts --apply
 * ```
 */
const APPLY = process.argv.includes("--apply");

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

/** 기존 종류의 표시 순서만 옮긴다 — 속성은 건드리지 않는다 */
const REORDER: { key: string; displayOrder: number }[] = [
  { key: "backpack", displayOrder: 0 },
  { key: "climbing", displayOrder: 2 },
];

const SUBTYPES: {
  key: string;
  labelKo: string;
  labelJa: string;
  labelEn: string;
  displayOrder: number;
  attrs: AttrSpec[];
}[] = [
  {
    key: "trekking-pole",
    labelKo: "스틱",
    labelJa: "トレッキングポール",
    labelEn: "Trekking poles",
    displayOrder: 1,
    attrs: [
      {
        key: "poleFoldType",
        type: "select",
        labelKo: "접이 방식",
        labelJa: "収納方式",
        labelEn: "Fold type",
        options: [
          ["telescopic", "텔레스코픽", "伸縮式", "Telescopic"],
          ["folding", "폴딩", "折りたたみ", "Folding"],
          ["fixed", "고정식", "固定式", "Fixed"],
        ],
      },
      {
        key: "poleMaterial",
        type: "select",
        labelKo: "소재",
        labelJa: "素材",
        labelEn: "Material",
        options: [
          ["aluminum", "알루미늄", "アルミ", "Aluminum"],
          ["carbon", "카본", "カーボン", "Carbon"],
          ["composite", "복합", "複合", "Composite"],
        ],
      },
      // 재사용 — 배낭·텐트·침낭이 이미 쓴다. 스틱은 무게가 선택 기준이다
      { key: "minWeight", reuse: true },
    ],
  },
  {
    key: "footwear",
    labelKo: "등산화",
    labelJa: "登山靴",
    labelEn: "Footwear",
    displayOrder: 3,
    attrs: [
      { key: "size", reuse: true },
      {
        key: "cutHeight",
        type: "select",
        labelKo: "컷 높이",
        labelJa: "カット",
        labelEn: "Cut height",
        options: [
          ["low", "로우컷", "ローカット", "Low cut"],
          ["mid", "미드컷", "ミッドカット", "Mid cut"],
          ["high", "하이컷", "ハイカット", "High cut"],
        ],
      },
      {
        key: "waterproofMembrane",
        type: "select",
        labelKo: "방수막",
        labelJa: "防水メンブレン",
        labelEn: "Waterproof membrane",
        options: [
          ["gore-tex", "고어텍스", "ゴアテックス", "Gore-Tex"],
          ["proprietary", "자체 방수막", "自社防水", "Proprietary"],
          ["none", "없음", "なし", "None"],
        ],
      },
      { key: "minWeight", reuse: true },
    ],
  },
  {
    key: "base-layer",
    labelKo: "베이스레이어",
    labelJa: "ベースレイヤー",
    labelEn: "Base layer",
    displayOrder: 4,
    attrs: [
      { key: "size", reuse: true },
      {
        key: "baseFabric",
        type: "select",
        labelKo: "원단",
        labelJa: "生地",
        labelEn: "Fabric",
        options: [
          ["merino", "메리노 울", "メリノウール", "Merino wool"],
          ["synthetic", "합성", "化繊", "Synthetic"],
          ["blend", "혼방", "混紡", "Blend"],
        ],
      },
      {
        key: "fabricWeight",
        type: "select",
        labelKo: "원단 두께",
        labelJa: "生地の厚み",
        labelEn: "Fabric weight",
        options: [
          ["light", "라이트", "ライトウェイト", "Lightweight"],
          ["mid", "미드", "ミッドウェイト", "Midweight"],
          ["heavy", "헤비", "ヘビーウェイト", "Heavyweight"],
        ],
      },
    ],
  },
  {
    key: "mid-layer",
    labelKo: "미드레이어",
    labelJa: "ミドルレイヤー",
    labelEn: "Mid layer",
    displayOrder: 5,
    attrs: [
      { key: "size", reuse: true },
      {
        key: "midType",
        type: "select",
        labelKo: "종류",
        labelJa: "タイプ",
        labelEn: "Type",
        options: [
          ["fleece", "플리스", "フリース", "Fleece"],
          ["light-puffy", "경량 패딩", "軽量パフィー", "Light puffy"],
          ["softshell", "소프트셸", "ソフトシェル", "Softshell"],
          ["vest", "베스트", "ベスト", "Vest"],
        ],
      },
      // 베이스레이어에서 만든 정의를 그대로 쓴다
      { key: "fabricWeight", reuse: true },
    ],
  },
  {
    key: "insulation",
    labelKo: "인슐레이션",
    labelJa: "インサレーション",
    labelEn: "Insulation",
    displayOrder: 6,
    attrs: [
      { key: "size", reuse: true },
      // ⚠️ 침낭이 쓰는 정의 그대로 — 충전재 축은 침낭과 다운재킷이 같다
      { key: "fillType", reuse: true },
      { key: "fillPower", reuse: true },
      { key: "minWeight", reuse: true },
    ],
  },
  {
    key: "shell",
    labelKo: "셸",
    labelJa: "シェル",
    labelEn: "Shell",
    displayOrder: 7,
    attrs: [
      { key: "size", reuse: true },
      {
        key: "shellLayers",
        type: "select",
        labelKo: "레이어 구성",
        labelJa: "レイヤー構成",
        labelEn: "Layer construction",
        options: [
          ["2l", "2레이어", "2レイヤー", "2-layer"],
          ["2.5l", "2.5레이어", "2.5レイヤー", "2.5-layer"],
          ["3l", "3레이어", "3レイヤー", "3-layer"],
        ],
      },
      {
        key: "waterproofRating",
        type: "number",
        labelKo: "내수압",
        labelJa: "耐水圧",
        labelEn: "Waterproof rating",
        unitKo: "mm",
        unitJa: "mm",
        unitEn: "mm",
      },
      { key: "minWeight", reuse: true },
    ],
  },
  {
    key: "pants",
    labelKo: "등산바지",
    labelJa: "登山パンツ",
    labelEn: "Hiking pants",
    displayOrder: 8,
    attrs: [
      { key: "size", reuse: true },
      {
        key: "pantsType",
        type: "select",
        labelKo: "종류",
        labelJa: "タイプ",
        labelEn: "Type",
        options: [
          ["trekking", "트레킹", "トレッキング", "Trekking"],
          ["softshell", "소프트셸", "ソフトシェル", "Softshell"],
          ["waterproof", "방수", "レインパンツ", "Waterproof"],
          ["convertible", "컨버터블", "コンバーチブル", "Convertible"],
        ],
      },
      { key: "minWeight", reuse: true },
    ],
  },
];

const url = migrationDatabaseUrl();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: stripSslMode(url), ssl: pgSslConfig(url) }),
});

async function findDef(key: string) {
  const d = await prisma.attributeDefinition.findUnique({ where: { key }, select: { id: true } });
  if (!d) throw new Error(`속성 정의 '${key}' 가 없습니다 — 재사용 전제가 깨졌습니다`);
  return d.id;
}

async function main() {
  console.log(`대상 DB — ${describeDatabase(url)}`);
  console.log(APPLY ? "모드: 적용\n" : "모드: 미리보기 (--apply 로 적용)\n");

  const category = await prisma.category.findUnique({
    where: { key: "hiking" },
    select: { id: true },
  });
  if (!category) throw new Error("등산 카테고리가 없습니다 — setup-hiking-category.ts 를 먼저 돌리세요");

  const before = await prisma.categorySubtype.findMany({
    where: { categoryId: category.id },
    select: { key: true, displayOrder: true },
    orderBy: { displayOrder: "asc" },
  });
  console.log(`기존 종류 ${before.length}개: ${before.map((s) => s.key).join(", ")}\n`);

  if (!APPLY) {
    for (const r of REORDER) {
      const cur = before.find((b) => b.key === r.key);
      if (cur && cur.displayOrder !== r.displayOrder) {
        console.log(`순서 변경 예정: ${r.key} ${cur.displayOrder} → ${r.displayOrder}`);
      }
    }
    for (const st of SUBTYPES) {
      const exists = before.some((b) => b.key === st.key);
      const reused = st.attrs.filter((a) => a.reuse).length;
      console.log(
        `${exists ? "이미 있음" : "생성 예정"}: ${st.labelKo} (${st.key}) — ` +
          `속성 ${st.attrs.length}개 (재사용 ${reused} · 신규 ${st.attrs.length - reused})`,
      );
    }
    const newDefs = new Set(
      SUBTYPES.flatMap((s) => s.attrs.filter((a) => !a.reuse).map((a) => a.key)),
    );
    console.log(`\n새 속성 정의 ${newDefs.size}개: ${[...newDefs].join(", ")}`);
    return;
  }

  // ── 기존 종류 순서 조정 ────────────────────────────────────────────────
  for (const r of REORDER) {
    await prisma.categorySubtype.updateMany({
      where: { categoryId: category.id, key: r.key },
      data: { displayOrder: r.displayOrder },
    });
  }
  console.log(`기존 종류 순서 조정 ${REORDER.length}개`);

  // ── 종류 + 전용 속성 ──────────────────────────────────────────────────
  for (const st of SUBTYPES) {
    const made = await prisma.categorySubtype.upsert({
      where: { categoryId_key: { categoryId: category.id, key: st.key } },
      update: { displayOrder: st.displayOrder },
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

  const after = await prisma.categorySubtype.findMany({
    where: { categoryId: category.id },
    select: { key: true, labelKo: true, displayOrder: true },
    orderBy: { displayOrder: "asc" },
  });
  console.log(`\n✅ 등산 종류 ${after.length}개`);
  for (const s of after) console.log(`  ${s.displayOrder}. ${s.labelKo} (${s.key})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
