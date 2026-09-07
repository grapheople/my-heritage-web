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
 * 속성을 **스펙 / 개인 값**으로 가른다 — `AttributeDefinition.isSpec` 백필 (D-312).
 *
 * ## ⚠️ 가르는 축은 "제품 값인가, 그 사람 값인가"
 * 케이스 지름은 같은 레퍼런스면 누구 것이든 같다 — **제품 값**이다. 구매가·
 * 구매처·상태·시리얼번호는 **그 사람 것**이고, 도감에 올리면 남의 개인 값이
 * 공용 사전에 박힌다 (D-099 가 검색에서 막은 것과 같은 부류).
 *
 * ## ⚠️ 같은 모델이 **여러 변형으로 팔리는 값**도 제외한다
 * 색·사이즈·프레임 사이즈·등판 길이는 제품 스펙처럼 보이지만 **한 도감 안에서
 * 개체마다 다르다.** 대표값을 내면 "이 옷은 M 입니다" 같은 거짓이 된다 —
 * 매칭 키가 그 축을 가르지 않기 때문이다 (옷 키는 `brand+model`, D-013).
 *
 * ## ⚠️ 매칭 키 구성 속성도 제외한다
 * `brand`·`model`·`uniqueId`·`year` 는 **도감의 정체성**이지 스펙이 아니다.
 * 이미 도감 상세가 고유값·브랜드를 따로 보여준다 (`getCodexAttrs`).
 *
 * ## 규칙
 * 1. 아래 `NON_SPEC` 에 있으면 **개인 값** (`isSpec = false`)
 * 2. 나머지 중 **활성 카테고리·종류 스코프가 있는 것**만 스펙
 *    → 운동 루틴 값(`sets`·`rpe`·`tempo`…)은 붙은 스코프가 없어 자연히 빠진다.
 *      운동 도감의 분류는 `Exercise` 마스터 컬럼이지 속성이 아니다 (D-227)
 *
 * ⚠️ **새로 만드는 속성은 기본값이 `false`** 다. 스키마 기본값이 그렇고, 켜는
 * 것은 A-02 에서 사람이 한다 — 조용히 스펙이 되어 도감에 올라가는 일이 없어야 한다.
 *
 * ```
 * pnpm tsx prisma/mark-spec-attributes.ts          # 미리보기
 * pnpm tsx prisma/mark-spec-attributes.ts --apply
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

/** 스펙이 **아닌** 것 — 사유를 함께 적는다. 목록만 있으면 다음 사람이 되묻는다 */
const NON_SPEC: Record<string, string> = {
  // ── 매칭 키 = 도감의 정체성 (스펙이 아니다)
  brand: "매칭 키 — 도감 정체성",
  model: "매칭 키 — 도감 정체성",
  uniqueId: "매칭 키 — 도감 정체성",
  year: "매칭 키(자전거)이고 시계에서는 개체의 생산 연도다",
  // ── 그 사람의 값
  purchaseDate: "개인 값 — 구매 이력",
  purchasePrice: "개인 값 — 구매 이력 (D-099 가 검색에서도 막았다)",
  purchasedFrom: "개인 값 — 구매 이력",
  condition: "개인 값 — 그 물건의 상태",
  serialNo: "개체 고유 — 제품 값이 아니다",
  note: "개인 값 — 자유 서술",
  referenceUrl: "개인 값 — 유저가 붙인 링크",
  accessories: "개인 값 — 그 사람이 가진 부속",
  // ── 한 도감 안에서 개체마다 다른 값
  color: "변형 — 같은 모델이 여러 색으로 팔린다 (옷 키는 brand+model)",
  size: "변형 — 개체마다 다르다",
  frameSize: "변형 — 같은 프레임이 여러 사이즈로 팔린다",
  torsoSize: "변형 — 같은 배낭이 여러 등판 길이로 팔린다",
  // ── 운동
  workoutDays: "루틴 값 — 그 사람의 수행 요일",
};

async function main() {
  console.log(`대상 DB — ${describeDatabase(scriptDbUrl)}`);
  console.log(APPLY ? "모드: 적용\n" : "모드: 미리보기 (--apply 로 적용)\n");

  const defs = await prisma.attributeDefinition.findMany({
    orderBy: { key: "asc" },
    select: {
      id: true,
      key: true,
      type: true,
      labelKo: true,
      isSpec: true,
      categoryAttributes: {
        where: { active: true },
        select: {
          category: { select: { key: true } },
          subtype: { select: { key: true } },
        },
      },
    },
  });

  const spec: typeof defs = [];
  const skipped: { key: string; why: string }[] = [];

  for (const d of defs) {
    const why = NON_SPEC[d.key];
    if (why) {
      skipped.push({ key: d.key, why });
      continue;
    }
    if (d.categoryAttributes.length === 0) {
      // 붙은 스코프가 없으면 등록 폼에도 안 나온다 — 도감에 올릴 이유가 없다
      skipped.push({ key: d.key, why: "활성 스코프 없음" });
      continue;
    }
    spec.push(d);
  }

  console.log(`스펙 ${spec.length}종`);
  for (const d of spec) {
    const scopes = [
      ...new Set(
        d.categoryAttributes.map((c) => c.category?.key ?? `${c.subtype?.key}`),
      ),
    ];
    const mark = d.isSpec ? " (이미 켜짐)" : "";
    console.log(`  ${d.key.padEnd(19)} ${d.labelKo.padEnd(12)} ${scopes.join(",")}${mark}`);
  }
  console.log(`\n제외 ${skipped.length}종`);
  for (const s of skipped) console.log(`  ${s.key.padEnd(19)} ${s.why}`);

  if (!APPLY) return;

  const on = await prisma.attributeDefinition.updateMany({
    where: { id: { in: spec.map((d) => d.id) }, isSpec: false },
    data: { isSpec: true },
  });
  /*
    ⚠️ **끄는 쪽도 함께 돌린다.** 목록에서 뺐는데 DB 에 켜진 채로 남으면 그
    속성이 계속 도감에 올라간다 — 스크립트를 다시 돌려도 낫지 않는 상태가 된다
  */
  const off = await prisma.attributeDefinition.updateMany({
    where: { id: { notIn: spec.map((d) => d.id) }, isSpec: true },
    data: { isSpec: false },
  });
  console.log(`\n켬 ${on.count}종 · 끔 ${off.count}종`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
