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
 * `purchasePrice`(구매가) 속성 **비활성화** — D-163.
 *
 * ## ⚠️ 삭제하지 않는다
 * 속성·브랜드·카테고리는 **비활성화만 한다** (D-036, M-09). 행을 지우면
 * `ItemAttributeValue` 가 함께 사라져 **이미 입력한 구매가가 복구 불가로
 * 없어진다.** 비활성화하면 값은 보존되고 표시에서만 제외된다:
 *
 * | 경로 | 동작 |
 * |---|---|
 * | 등록·수정 폼 (`getCategoryAttributes`) | `active: true` 만 조회 → 칸이 사라진다 |
 * | 아이템 상세 (`getItemDetail`) | 비활성 값은 표시에서 제외 (D-036) |
 * | 수정 저장 (`updateItemAs`) | **active 만 순회** → 저장된 값을 지우지 않는다 |
 * | 검색 | 애초에 제외 대상이었다 (`SEARCH_EXCLUDED_KEYS`) |
 *
 * ## 이 스크립트는 **기존 환경용**이다
 * 새 환경은 `bootstrap-attributes.ts` 의 `PRIVATE` 에서 `purchasePrice` 를
 * 빼두었으므로 애초에 붙지 않는다. 이 스크립트는 **이미 붙어 있는** docker ·
 * Supabase 를 맞추는 용도다.
 *
 * 여러 번 실행해도 결과가 같다(idempotent).
 *
 * ```
 * pnpm attrs:drop-price
 * ```
 */
const KEY = "purchasePrice";

async function main() {
  const url = migrationDatabaseUrl();
  // ⚠️ 비밀번호를 출력하지 않는다 — host:port/db 만 (D-116)
  console.log(`대상 DB — ${describeDatabase(url)}`);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: stripSslMode(url),
      ssl: pgSslConfig(url),
    }),
  });

  const def = await prisma.attributeDefinition.findUnique({
    where: { key: KEY },
    select: { id: true },
  });
  if (!def) {
    console.log(`속성 정의 \`${KEY}\` 가 없습니다 — 할 일 없음`);
    return;
  }

  const rows = await prisma.categoryAttribute.findMany({
    where: { attributeDefinitionId: def.id },
    select: { id: true, active: true, category: { select: { key: true } } },
  });
  console.log(`연결된 카테고리 ${rows.length}개`);

  const values = await prisma.itemAttributeValue.count({
    where: { categoryAttribute: { attributeDefinitionId: def.id } },
  });
  // 값이 몇 건 보존되는지 남긴다 — "지운 것이 아니다"를 확인할 수 있게
  console.log(`보존되는 기존 값 ${values}건 (삭제하지 않는다 — D-036)`);

  const { count } = await prisma.categoryAttribute.updateMany({
    where: { attributeDefinitionId: def.id, active: true },
    data: { active: false },
  });
  console.log(`비활성화 ${count}개 (이미 비활성 ${rows.length - count}개)`);

  const after = await prisma.categoryAttribute.count({
    where: { attributeDefinitionId: def.id, active: true },
  });
  console.log(after === 0 ? "✅ 활성 0개 — 완료" : `❌ 아직 활성 ${after}개`);
}

main();
