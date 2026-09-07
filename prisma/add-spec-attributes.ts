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
 * 카테고리·종류별 **도감 스펙 칸을 정비한다** (D-313).
 *
 * ## ⚠️ 무엇을 스펙으로 두는가 — 판정 기준을 먼저 고정한다
 * 셋을 **모두** 만족해야 넣는다:
 * 1. **제품 스펙시트에 실리는 값**이다 (제조사가 공표한다)
 * 2. **개체마다 변하지 않는다** — 색·사이즈·구매가는 여기 없다 (D-312)
 * 3. **그 카테고리 안에서 비교에 쓰인다** — 있어도 아무도 안 보는 값은 뺀다
 *
 * ⚠️ **폼이 길어지는 비용이 있다.** 카테고리 속성은 아이템 등록 폼에도 그려진다
 * (D-291 이 시계에 7종을 더한 것과 같다). 그래서 **전부 선택 입력**이고, 한
 * 스코프에 6종을 넘기지 않는다 — 유저가 스펙 시트를 옮겨 적는 화면이 아니다.
 *
 * ⚠️ **기존 정의를 먼저 찾는다.** `minWeight`·`frameMaterial` 처럼 이미 있는
 * 것을 새 키로 또 만들면 같은 값이 두 칸으로 갈린다. 이름이 어색하면 **카테고리
 * 라벨 override**(D-168)로 바꾼다 — 신발의 `minWeight` 는 "무게"로 뜬다.
 *
 * ⚠️ **단위는 키에 붙는다** (D-291 의 `thickness` 함정). 같은 키를 다른 단위로
 * 쓰고 싶으면 **새 키**를 만든다.
 *
 * ## ⚠️ 데스크테리어·운동은 대상이 아니다
 * - **운동**: 도감이 `Exercise` 마스터이고 분류가 이미 그 컬럼에 있다 (D-227).
 *   속성으로 또 만들면 두 벌이 된다
 * - **데스크테리어**: **종류 축이 없다.** 키보드 스위치와 모니터 해상도를 같은
 *   칸에 못 넣는다 — 종류를 먼저 만들어야 한다 (OI)
 *
 * ```
 * pnpm tsx prisma/add-spec-attributes.ts --category=shoes
 * pnpm tsx prisma/add-spec-attributes.ts --category=shoes --apply
 * ```
 */
const scriptDbUrl = migrationDatabaseUrl();
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: stripSslMode(scriptDbUrl),
    ssl: pgSslConfig(scriptDbUrl),
  }),
});
const APPLY = process.argv.includes("--apply");
const CATEGORY = process.argv
  .find((a) => a.startsWith("--category="))
  ?.slice("--category=".length);

type Opt = { key: string; ko: string; ja: string; en: string };
/** 새로 만들 정의. 이미 있으면 건드리지 않는다 */
type Def = {
  key: string;
  type: "text" | "number" | "select" | "boolean";
  ko: string;
  ja: string;
  en: string;
  /** `number` 만. 3개 언어 필수 (D-038) */
  unit?: [string, string, string];
  options?: Opt[];
};
/** 어디에 붙일지. `subtype` 이 없으면 카테고리 공통 */
type Attach = {
  defKey: string;
  subtype?: string;
  /** 카테고리·종류에서만 다른 이름을 쓸 때 (D-168). 3개 언어를 함께 채운다 */
  label?: [string, string, string];
};

const PLAN: Record<string, { defs: Def[]; attach: Attach[] }> = {
  /* ── 신발 (도감 80) — 스펙 0종이었다 ────────────────────────────
     러닝화·스니커 스펙시트의 공통 항목이다. 사이즈·색은 개체 변형이라 뺐다 */
  shoes: {
    defs: [
      {
        key: "upperMaterial",
        type: "select",
        ko: "갑피 소재", ja: "アッパー素材", en: "Upper material",
        options: [
          { key: "leather", ko: "가죽", ja: "レザー", en: "Leather" },
          { key: "suede", ko: "스웨이드", ja: "スエード", en: "Suede" },
          { key: "mesh", ko: "메시", ja: "メッシュ", en: "Mesh" },
          { key: "knit", ko: "니트", ja: "ニット", en: "Knit" },
          { key: "canvas", ko: "캔버스", ja: "キャンバス", en: "Canvas" },
          { key: "synthetic", ko: "합성", ja: "合成素材", en: "Synthetic" },
        ],
      },
      // ⚠️ 자유 입력이다 — `Boost`·`ZoomX`·`EVA` 처럼 브랜드마다 이름이 다르다
      { key: "midsole", type: "text", ko: "중창", ja: "ミッドソール", en: "Midsole" },
      { key: "outsole", type: "text", ko: "겉창", ja: "アウトソール", en: "Outsole" },
      {
        key: "dropHeight",
        type: "number",
        ko: "드롭", ja: "ドロップ", en: "Drop",
        unit: ["mm", "mm", "mm"],
      },
      {
        key: "closure",
        type: "select",
        ko: "클로저", ja: "クロージャー", en: "Closure",
        options: [
          { key: "lace", ko: "끈", ja: "紐", en: "Lace" },
          { key: "velcro", ko: "벨크로", ja: "ベルクロ", en: "Velcro" },
          { key: "slip-on", ko: "슬립온", ja: "スリッポン", en: "Slip-on" },
          { key: "boa", ko: "BOA 다이얼", ja: "BOAダイヤル", en: "BOA dial" },
        ],
      },
    ],
    attach: [
      { defKey: "upperMaterial" },
      { defKey: "midsole" },
      { defKey: "outsole" },
      { defKey: "dropHeight" },
      { defKey: "closure" },
      // 기존 `minWeight`(g) 재사용 — 신발에서는 "최소 무게" 가 어색하다
      { defKey: "minWeight", label: ["무게", "重量", "Weight"] },
    ],
  },

  /* ── 옷 (도감 302) — 스펙 0종이었다 ────────────────────────────
     ⚠️ 옷은 같은 모델이 색·사이즈로 갈린다(매칭 키가 `brand+model`). 그래서
     **개체를 가르지 않는 값**만 남았다 — 소재·핏·원단 두께 */
  apparel: {
    defs: [
      {
        key: "apparelMaterial",
        type: "text",
        ko: "주 소재", ja: "主素材", en: "Main material",
      },
      {
        key: "apparelFit",
        type: "select",
        ko: "핏", ja: "フィット", en: "Fit",
        options: [
          { key: "slim", ko: "슬림", ja: "スリム", en: "Slim" },
          { key: "regular", ko: "레귤러", ja: "レギュラー", en: "Regular" },
          { key: "relaxed", ko: "릴랙스", ja: "リラックス", en: "Relaxed" },
          { key: "oversized", ko: "오버사이즈", ja: "オーバーサイズ", en: "Oversized" },
        ],
      },
    ],
    attach: [
      { defKey: "apparelMaterial" },
      { defKey: "apparelFit" },
      // 등산 레이어에 쓰던 `fabricWeight`(라이트·미드·헤비) 를 그대로 쓴다
      { defKey: "fabricWeight" },
    ],
  },

  /* ── 시계 (도감 327) — D-291 의 7종에 2종을 더한다 ──────────────
     컬렉터가 레퍼런스 다음으로 보는 값이고 제조사가 항상 공표한다 */
  watch: {
    defs: [
      {
        key: "caseMaterial",
        type: "select",
        ko: "케이스 소재", ja: "ケース素材", en: "Case material",
        options: [
          { key: "steel", ko: "스테인리스 스틸", ja: "ステンレススチール", en: "Stainless steel" },
          { key: "titanium", ko: "티타늄", ja: "チタン", en: "Titanium" },
          { key: "gold", ko: "금", ja: "ゴールド", en: "Gold" },
          { key: "ceramic", ko: "세라믹", ja: "セラミック", en: "Ceramic" },
          { key: "bronze", ko: "브론즈", ja: "ブロンズ", en: "Bronze" },
          { key: "carbon", ko: "카본", ja: "カーボン", en: "Carbon" },
        ],
      },
      {
        key: "crystal",
        type: "select",
        ko: "글라스", ja: "風防", en: "Crystal",
        options: [
          { key: "sapphire", ko: "사파이어", ja: "サファイア", en: "Sapphire" },
          { key: "mineral", ko: "미네랄", ja: "ミネラル", en: "Mineral" },
          { key: "acrylic", ko: "아크릴", ja: "アクリル", en: "Acrylic" },
        ],
      },
    ],
    attach: [{ defKey: "caseMaterial" }, { defKey: "crystal" }],
  },

  /* ── 자전거 (도감 191) — 완성차가 0종이었다 ─────────────────────
     ⚠️ 완성차는 **기존 부품 정의를 그대로** 쓴다. 새 키를 만들면 프레임 소재가
     `frameMaterial` 과 `completeFrameMaterial` 로 갈린다 */
  bicycle: {
    defs: [
      {
        key: "brakeMount",
        type: "select",
        ko: "마운트 규격", ja: "マウント規格", en: "Mount standard",
        options: [
          { key: "flat-mount", ko: "플랫 마운트", ja: "フラットマウント", en: "Flat mount" },
          { key: "post-mount", ko: "포스트 마운트", ja: "ポストマウント", en: "Post mount" },
          { key: "is", ko: "IS", ja: "IS", en: "IS" },
          { key: "rim", ko: "림 브레이크", ja: "リムブレーキ", en: "Rim brake" },
        ],
      },
    ],
    attach: [
      { defKey: "frameMaterial", subtype: "complete" },
      { defKey: "speeds", subtype: "complete" },
      { defKey: "brakeType", subtype: "complete" },
      { defKey: "minWeight", subtype: "complete", label: ["무게", "重量", "Weight"] },
      { defKey: "brakeMount", subtype: "brakes" },
      { defKey: "minWeight", subtype: "tire", label: ["무게", "重量", "Weight"] },
    ],
  },

  /* ── 캠핑 (도감 434) — 얇은 종류를 메운다 ───────────────────────
     무게는 **캠핑 장비 비교의 첫 축**인데 버너·쿨러·체어에 없었다 */
  camping: {
    defs: [
      {
        key: "tarpShape",
        type: "select",
        ko: "형태", ja: "形状", en: "Shape",
        options: [
          { key: "rectangular", ko: "렉타(사각)", ja: "レクタ", en: "Rectangular" },
          { key: "hexagonal", ko: "헥사", ja: "ヘキサ", en: "Hexagonal" },
          { key: "square", ko: "스퀘어", ja: "スクエア", en: "Square" },
          { key: "wing", ko: "윙", ja: "ウイング", en: "Wing" },
          { key: "shelter", ko: "셸터형", ja: "シェルター", en: "Shelter" },
        ],
      },
    ],
    attach: [
      { defKey: "tarpShape", subtype: "tarp" },
      // 타프는 바닥이 없다 — 같은 `㎡` 를 "면적" 으로 부른다 (D-168)
      { defKey: "floorArea", subtype: "tarp", label: ["면적", "面積", "Area"] },
      { defKey: "minWeight", subtype: "furniture", label: ["무게", "重量", "Weight"] },
      { defKey: "minWeight", subtype: "cooler", label: ["무게", "重量", "Weight"] },
      { defKey: "minWeight", subtype: "stove", label: ["무게", "重量", "Weight"] },
    ],
  },

  /* ── 등산 (도감 833) — 가장 크고 가장 얇았다 ────────────────────
     셸의 투습도·등산화의 드롭과 겉창은 **구매 판단의 핵심 축**이다 */
  hiking: {
    defs: [
      {
        key: "breathability",
        type: "number",
        ko: "투습도", ja: "透湿度", en: "Breathability",
        unit: ["g/㎡·24h", "g/㎡·24h", "g/m²/24h"],
      },
      {
        key: "poleMaxLength",
        type: "number",
        ko: "최대 길이", ja: "最大長", en: "Max length",
        unit: ["cm", "cm", "cm"],
      },
    ],
    attach: [
      { defKey: "breathability", subtype: "shell" },
      { defKey: "poleMaxLength", subtype: "trekking-pole" },
      { defKey: "outsole", subtype: "footwear" },
      { defKey: "dropHeight", subtype: "footwear" },
    ],
  },
};

/**
 * 전 카테고리의 정의를 한 색인으로 모은다.
 *
 * ⚠️ **카테고리를 넘나드는 공유 정의가 있다** — 등산 `footwear` 는 신발의
 * `outsole`·`dropHeight` 를 쓴다. 색인이 없으면 "신발을 먼저 돌려야 등산이
 * 된다"는 **보이지 않는 순서 의존**이 생긴다
 */
const DEF_INDEX = new Map<string, Def>(
  Object.values(PLAN).flatMap((p) => p.defs.map((d) => [d.key, d] as const)),
);

/** 정의 upsert — 있으면 라벨을 덮지 않고 `isSpec` 만 켠다 */
async function ensureDef(d: Def): Promise<string> {
  const def = await prisma.attributeDefinition.upsert({
    where: { key: d.key },
    // ⚠️ 이미 있으면 라벨을 덮지 않는다 — 어드민이 고쳤을 수 있다 (D-277 태도)
    update: { isSpec: true },
    create: {
      key: d.key,
      type: d.type,
      labelKo: d.ko, labelJa: d.ja, labelEn: d.en,
      unitKo: d.unit?.[0], unitJa: d.unit?.[1], unitEn: d.unit?.[2],
      // 카테고리 전용 커스텀이라 3개 언어를 직접 채웠다 (D-010)
      isCommon: false,
      // D-312 — 도감이 값을 가질 수 있는 속성이다
      isSpec: true,
    },
    select: { id: true },
  });

  for (const [i, o] of (d.options ?? []).entries()) {
    const exists = await prisma.attributeOption.findFirst({
      where: { attributeDefinitionId: def.id, key: o.key, categoryId: null },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.attributeOption.create({
      data: {
        attributeDefinitionId: def.id,
        key: o.key,
        labelKo: o.ko, labelJa: o.ja, labelEn: o.en,
        displayOrder: i,
      },
    });
  }
  return def.id;
}

async function main() {
  console.log(`대상 DB — ${describeDatabase(scriptDbUrl)}`);
  console.log(APPLY ? "모드: 적용" : "모드: 미리보기 (--apply 로 적용)");

  if (!CATEGORY || !PLAN[CATEGORY]) {
    console.log(`\n사용법: --category=<${Object.keys(PLAN).join("|")}> [--apply]`);
    console.log("⚠️ 데스크테리어·운동은 대상이 아닙니다 (파일 상단 주석 참조)");
    return;
  }

  const plan = PLAN[CATEGORY];
  const category = await prisma.category.findUnique({
    where: { key: CATEGORY },
    select: { id: true },
  });
  if (!category) throw new Error(`카테고리 '${CATEGORY}' 가 없습니다`);

  console.log(`\n■ ${CATEGORY} — 새 정의 ${plan.defs.length}종 · 연결 ${plan.attach.length}건\n`);

  /* ── ① 정의 ── */
  for (const d of plan.defs) {
    const has = await prisma.attributeDefinition.findUnique({
      where: { key: d.key },
      select: { id: true, isSpec: true },
    });
    console.log(`  정의 ${d.key.padEnd(18)} ${d.ko.padEnd(12)} ${has ? "이미 있음" : "신규"}`);
    if (APPLY) await ensureDef(d);
  }

  /* ── ② 연결 ── */
  for (const a of plan.attach) {
    let def = await prisma.attributeDefinition.findUnique({
      where: { key: a.defKey },
      select: { id: true, labelKo: true },
    });
    if (!def) {
      // 다른 카테고리 계획에 있는 정의면 여기서 만든다 — 위 색인 주석 참조
      const shared = DEF_INDEX.get(a.defKey);
      if (!shared) {
        console.log(`  ✗ ${a.defKey} — 이 DB 에도 계획에도 없는 정의입니다`);
        continue;
      }
      if (!APPLY) {
        console.log(`  연결 ${a.defKey.padEnd(18)} → ${(a.subtype ?? "공통").padEnd(14)} 신규 (정의도 함께 생성)`);
        continue;
      }
      const id = await ensureDef(shared);
      def = { id, labelKo: shared.ko };
    }
    const subtype = a.subtype
      ? await prisma.categorySubtype.findUnique({
          where: { categoryId_key: { categoryId: category.id, key: a.subtype } },
          select: { id: true, labelKo: true },
        })
      : null;
    if (a.subtype && !subtype) {
      console.log(`  ✗ ${a.defKey} — 종류 '${a.subtype}' 가 없습니다`);
      continue;
    }

    /*
      ⚠️ **양방향 중복 가드** (D-252). 공통에 있는 것을 종류에 또 붙이면 등록
      폼에 같은 칸이 두 번 그려진다. 반대 방향도 같다
    */
    const onCategory = await prisma.categoryAttribute.findUnique({
      where: {
        categoryId_attributeDefinitionId: {
          categoryId: category.id,
          attributeDefinitionId: def.id,
        },
      },
      select: { id: true },
    });
    if (subtype && onCategory) {
      console.log(`  ✗ ${a.defKey} → ${a.subtype} — 이미 카테고리 공통입니다 (D-252)`);
      continue;
    }
    if (!subtype) {
      const onSubtype = await prisma.categoryAttribute.findFirst({
        where: { attributeDefinitionId: def.id, subtype: { categoryId: category.id } },
        select: { subtype: { select: { labelKo: true } } },
      });
      if (onSubtype) {
        console.log(`  ✗ ${a.defKey} → 공통 — 이미 '${onSubtype.subtype?.labelKo}' 종류에 있습니다 (D-252)`);
        continue;
      }
    }

    const where = subtype
      ? { subtypeId_attributeDefinitionId: { subtypeId: subtype.id, attributeDefinitionId: def.id } }
      : {
          categoryId_attributeDefinitionId: {
            categoryId: category.id,
            attributeDefinitionId: def.id,
          },
        };
    const already = await prisma.categoryAttribute.findUnique({ where, select: { id: true } });
    const at = subtype ? `${a.subtype}` : "공통";
    console.log(
      `  연결 ${a.defKey.padEnd(18)} → ${at.padEnd(14)} ${already ? "이미 있음" : "신규"}${a.label ? ` (라벨 "${a.label[0]}")` : ""}`,
    );
    if (!APPLY || already) continue;

    // 표시 순서는 그 스코프의 맨 뒤 — 기존 속성 순서를 흔들지 않는다
    const max = await prisma.categoryAttribute.aggregate({
      where: subtype ? { subtypeId: subtype.id } : { categoryId: category.id },
      _max: { displayOrder: true },
    });
    await prisma.categoryAttribute.create({
      data: {
        categoryId: subtype ? null : category.id,
        subtypeId: subtype?.id ?? null,
        attributeDefinitionId: def.id,
        // ⚠️ 전부 선택 입력이다 — 필수로 걸면 기존 아이템 수정이 막힌다 (D-291)
        required: false,
        active: true,
        displayOrder: (max._max.displayOrder ?? 0) + 1,
        ...(a.label ? { labelKo: a.label[0], labelJa: a.label[1], labelEn: a.label[2] } : {}),
      },
    });
  }

  if (!APPLY) console.log(`\n적용: pnpm tsx prisma/add-spec-attributes.ts --category=${CATEGORY} --apply`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
