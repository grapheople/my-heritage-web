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
 * 출시 ⑤·⑥ 최초 구성 — A-02 카테고리별 속성 조합 + A-03 매칭 키 (D-118).
 *
 * ## ⚠️ 이미 구성된 카테고리는 **건너뛴다**
 * 조합과 매칭 키는 **운영 판단**이다 (D-097). 이 스크립트가 덮어쓰면 운영이
 * 화면에서 조정한 값을 개발자가 재실행 한 번으로 되돌리게 된다 — D-097 이
 * `seed-dev` 를 원격에서 막은 것과 **같은 위험**이다.
 *
 * 그래서 "빈 카테고리를 채우는" 일만 한다. 변경은 어드민 화면에서 한다.
 *
 * ## ⚠️ 매칭 키를 바꾸면 기존 도감과 매칭되지 않는다
 * `attributeKeys` 의 **순서가 정규화 순서**다 (FR-01-A-05). 운영 중에 바꾸면
 * 그 카테고리의 신규 아이템이 기존 도감을 못 찾고 새로 만든다. 그래서 여기서도
 * 이미 있으면 손대지 않는다.
 */

/** `required` 규칙 — 아래 표의 근거 */
type Attr = { key: string; required?: boolean };

/**
 * 카테고리별 구성.
 *
 * | 결정 | 내용 |
 * |---|---|
 * | 매칭 키 | `codex` D-013 표 (캠핑의 `modelNo` 는 `model` 로 읽는다 — D-118) |
 * | `model` 전 카테고리 필수 | 명칭은 저장하지 않는 파생값이다 (D-073). 도감·브랜드·고유값이 **동시에 빌 수 있는 경로가 실재**해서, 하나는 보장해야 이름 없는 아이템이 안 생긴다 |
 * | `brand` 는 매칭 키여도 **필수 아님** | 마스터에 없는 브랜드는 요청 대기로 비어 있을 수 있다 (D-046). 필수로 하면 그 유저는 첫 아이템을 등록하지 못한다. `FR-01-A-02` 의 의도적 예외 |
 * | `serialNo` 제외 | 비공개 처리는 구매 정보 3개에만 걸려 있다. 켜면 시리얼번호가 타인에게 그대로 보인다 |
 *
 * 표시 순서는 6개 카테고리를 통일했다 — 유저가 카테고리를 바꿔도 폼이 같은 자리에 있다.
 */
const ORDER = [
  "brand", "model", "uniqueId", "year", "size", "color", "condition",
  "accessories", "purchaseDate", "purchasedFrom", "purchasePrice",
  "referenceUrl", "note",
] as const;

const PRIVATE = ["purchaseDate", "purchasedFrom", "purchasePrice"];
const TAIL = ["referenceUrl", "note"];

const PLAN: Record<string, { matchingKey: string[]; attrs: Attr[] }> = {
  watch: {
    matchingKey: ["uniqueId"],
    attrs: [
      { key: "brand" }, { key: "model", required: true },
      { key: "uniqueId", required: true }, { key: "year" },
      { key: "color" }, { key: "condition" }, { key: "accessories" },
      ...PRIVATE.map((key) => ({ key })), ...TAIL.map((key) => ({ key })),
    ],
  },
  shoes: {
    matchingKey: ["uniqueId"],
    attrs: [
      { key: "brand" }, { key: "model", required: true },
      { key: "uniqueId", required: true }, { key: "size" },
      { key: "color" }, { key: "condition" }, { key: "accessories" },
      ...PRIVATE.map((key) => ({ key })), ...TAIL.map((key) => ({ key })),
    ],
  },
  bicycle: {
    // 단일 코드가 없다. 프레임 시리얼은 개체 식별용이라 모델 키로 부적합 (D-013)
    matchingKey: ["brand", "model", "year"],
    attrs: [
      { key: "brand" }, { key: "model", required: true },
      { key: "year", required: true }, { key: "size" },
      { key: "color" }, { key: "condition" },
      ...PRIVATE.map((key) => ({ key })), ...TAIL.map((key) => ({ key })),
    ],
  },
  apparel: {
    // 품번이 브랜드마다 불규칙 — 가장 취약한 카테고리 (D-013)
    matchingKey: ["brand", "model"],
    attrs: [
      { key: "brand" }, { key: "model", required: true },
      { key: "size" }, { key: "color" }, { key: "condition" },
      ...PRIVATE.map((key) => ({ key })), ...TAIL.map((key) => ({ key })),
    ],
  },
  camping: {
    matchingKey: ["brand", "model"],
    attrs: [
      { key: "brand" }, { key: "model", required: true },
      { key: "color" }, { key: "condition" }, { key: "accessories" },
      ...PRIVATE.map((key) => ({ key })), ...TAIL.map((key) => ({ key })),
    ],
  },
  deskterior: {
    matchingKey: ["brand", "model"],
    attrs: [
      { key: "brand" }, { key: "model", required: true },
      { key: "color" }, { key: "condition" }, { key: "accessories" },
      ...PRIVATE.map((key) => ({ key })), ...TAIL.map((key) => ({ key })),
    ],
  },
};

const url = migrationDatabaseUrl();
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: stripSslMode(url),
    ssl: pgSslConfig(url),
  }),
});

async function main() {
  console.log(`  대상 DB: ${describeDatabase(url)}\n`);

  const defs = await prisma.attributeDefinition.findMany({
    select: { id: true, key: true },
  });
  const defByKey = new Map(defs.map((d) => [d.key, d.id]));

  let created = 0;
  let skipped = 0;

  for (const [categoryKey, plan] of Object.entries(PLAN)) {
    const category = await prisma.category.findUnique({
      where: { key: categoryKey },
      select: { id: true },
    });
    if (!category) {
      console.log(`  ⚠️ ${categoryKey.padEnd(12)} 카테고리가 없습니다 — 건너뜁니다`);
      continue;
    }

    const existing = await prisma.categoryAttribute.count({
      where: { categoryId: category.id },
    });
    if (existing > 0) {
      // 운영이 이미 구성했다. 덮어쓰지 않는다 (D-097)
      console.log(`  · ${categoryKey.padEnd(12)} 이미 ${existing}개 구성됨 — 건너뜁니다`);
      skipped += 1;
      continue;
    }

    const missing = plan.attrs.filter((a) => !defByKey.has(a.key));
    if (missing.length > 0) {
      // 조용히 일부만 넣으면 폼에 구멍이 뚫린 채로 출시된다
      throw new Error(
        `${categoryKey}: 속성 정의가 없습니다 — ${missing.map((m) => m.key).join(", ")}`,
      );
    }

    await prisma.categoryAttribute.createMany({
      data: plan.attrs.map((a) => ({
        categoryId: category.id,
        attributeDefinitionId: defByKey.get(a.key)!,
        required: a.required ?? false,
        displayOrder: ORDER.indexOf(a.key as (typeof ORDER)[number]),
        active: true,
      })),
    });

    const mk = await prisma.matchingKeyDefinition.findUnique({
      where: { categoryId: category.id },
      select: { attributeKeys: true },
    });
    if (!mk) {
      await prisma.matchingKeyDefinition.create({
        data: { categoryId: category.id, attributeKeys: plan.matchingKey },
      });
    }

    const req = plan.attrs.filter((a) => a.required).map((a) => a.key);
    console.log(
      `  ✅ ${categoryKey.padEnd(12)} 속성 ${String(plan.attrs.length).padStart(2)}개 · 필수 ${req.join("+")} · 매칭 키 ${
        mk ? `${mk.attributeKeys.join("+")} (기존 유지)` : plan.matchingKey.join("+")
      }`,
    );
    created += 1;
  }

  console.log(`\n  신규 ${created}개 카테고리 · 건너뜀 ${skipped}개`);
  if (skipped > 0) {
    console.log("  ⚠️ 건너뛴 카테고리는 어드민 화면(A-02)에서 조정하세요 — 이 스크립트는 덮어쓰지 않습니다");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
