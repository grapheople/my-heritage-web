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
 * 매칭 키를 **필수에서 푼다** + 카테고리별 라벨 override (D-168·D-169).
 *
 * ## 왜 (1) — "고유값을 모르겠어요" 체크박스를 없애기 위해
 * 그 체크박스는 **매칭 키의 `required` 를 면제**하는 스위치였다 (D-032). 그런데
 * **비어 있음이 이미 같은 뜻**이다 — `buildMatchingKey` 는 값이 없으면 `null` 을
 * 내고 도감 연결이 건너뛰어진다. 매칭 키를 `required` 에서 풀면 스위치가 필요
 * 없어진다.
 *
 * ## ⚠️ `model` 은 매칭 키여도 **필수로 남긴다**
 * 아이템 명칭은 저장하지 않는 파생값이고(D-073), 도감·브랜드가 동시에 빌 수
 * 있으므로 `model` 하나는 보장해야 **이름 없는 아이템**이 안 생긴다 (D-118).
 *
 * 그런데 체크박스는 그 `model` 까지 면제했다 — 옷·캠핑·데스크테리어·운동은
 * `model` 이 매칭 키라, 체크하면 **이름 없는 아이템을 만들 수 있었다.**
 * 체크박스를 없애면 그 구멍도 같이 닫힌다.
 *
 * ## 왜 (2) — 운동 등록 폼의 "모델명"
 * `model` 라벨이 키 단위 전역이라 운동에서도 "모델명"으로 떴다 (OI-83).
 * `CategoryAttribute` 의 override 로 **운동만 "운동명"** 으로 바꾼다.
 *
 * 멱등이다.
 *
 * ```
 * pnpm attrs:relax-keys
 * ```
 */

/** 카테고리별 라벨 override — `[카테고리, 속성, ko, ja, en]` */
const LABEL_OVERRIDES: [string, string, string, string, string][] = [
  ["workout", "model", "운동명", "種目名", "Exercise"],
  /*
    ⚠️ 시계의 `uniqueId` 는 **레퍼런스**다 (D-187). "고유번호"는 컬렉터가 쓰는
    말이 아니다 — 시계는 레퍼런스(Ref.), 신발은 스타일 코드라고 부른다. 전역
    라벨을 바꾸면 신발까지 "레퍼런스"가 되므로 카테고리 override 로 둔다.

    ⚠️ **라벨만 바꾸고 끝내면 안 된다.** `reg.codexNotLinked` 가 "고유번호를
    넣으면"이라고 하드코딩돼 있었다 — 라벨은 레퍼런스인데 안내문은 고유번호가
    되는 D-029 워싱 사고와 같은 모양이다. 그 문구는 **매칭 키 라벨을 받아
    쓰도록** 바꿨다(자전거·옷 등에서 애초에 틀린 문구이기도 했다).
  */
  ["watch", "uniqueId", "레퍼런스", "リファレンス", "Reference"],
  /*
    ⚠️ 신발은 **스타일 코드**다 (D-189). 라벨이 단위를 말해준다 — 스타일 코드는
    **배색까지 특정**하므로(`DD1391-100` = Dunk Low White/Black) 색이 다르면 다른
    도감이다. "고유번호"로 두면 유저가 모델 번호(`1460`)를 넣게 되고, 그러면
    박스 코드를 넣은 사람과 **서로 다른 도감에 갈린다**.

    조사 프롬프트도 이 라벨을 그대로 읽는다 (`codexKeyList`) — 라벨을 고치면
    프롬프트가 따라온다.
  */
  ["shoes", "uniqueId", "스타일 코드", "スタイルコード", "Style code"],
];

async function main() {
  const url = migrationDatabaseUrl();
  console.log(`대상 DB — ${describeDatabase(url)}`);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: stripSslMode(url),
      ssl: pgSslConfig(url),
    }),
  });

  /* ── 1. 매칭 키를 필수에서 푼다 (`model` 제외) ── */
  const cats = await prisma.category.findMany({
    select: {
      key: true,
      matchingKey: { select: { attributeKeys: true } },
      attributes: {
        select: {
          id: true,
          required: true,
          attributeDefinition: { select: { key: true } },
        },
      },
    },
  });

  let relaxed = 0;
  for (const c of cats) {
    const keys = new Set(c.matchingKey?.attributeKeys ?? ["uniqueId"]);
    for (const a of c.attributes) {
      const key = a.attributeDefinition.key;
      // ⚠️ `model` 은 예외다 — 위 주석 참조 (D-118)
      if (key === "model") continue;
      if (!keys.has(key) || !a.required) continue;
      await prisma.categoryAttribute.update({
        where: { id: a.id },
        data: { required: false },
      });
      console.log(`  ${c.key}.${key} 필수 해제`);
      relaxed++;
    }
  }
  console.log(`필수 해제 ${relaxed}개`);

  /* ── 2. 라벨 override ── */
  for (const [catKey, attrKey, ko, ja, en] of LABEL_OVERRIDES) {
    const category = await prisma.category.findUnique({
      where: { key: catKey },
      select: { id: true },
    });
    const def = await prisma.attributeDefinition.findUnique({
      where: { key: attrKey },
      select: { id: true },
    });
    if (!category || !def) {
      console.log(`  ⚠️ ${catKey}.${attrKey} — 카테고리 또는 속성이 없습니다`);
      continue;
    }
    await prisma.categoryAttribute.update({
      where: {
        categoryId_attributeDefinitionId: {
          categoryId: category.id,
          attributeDefinitionId: def.id,
        },
      },
      // ⚠️ 3개 언어를 **함께** 채운다 (D-010). 하나만 채우면 그 언어 유저만
      // 다른 이름을 보고, 한 속성이 언어에 따라 다른 것을 가리키게 된다
      data: { labelKo: ko, labelJa: ja, labelEn: en },
    });
    console.log(`  ${catKey}.${attrKey} 라벨 → ${ko} / ${ja} / ${en}`);
  }

  /* ── 확인 ── */
  const still = await prisma.categoryAttribute.findMany({
    where: { required: true, active: true },
    select: {
      category: { select: { key: true, matchingKey: { select: { attributeKeys: true } } } },
      attributeDefinition: { select: { key: true } },
    },
  });
  // ⚠️ `category` 가 nullable 이 됐다 (D-207) — 제품군 전용 행은 카테고리가
  // 없다. 이 스크립트는 **카테고리 공통 행만** 다루므로 그것만 남긴다
  const common = still.filter(
    (a): a is typeof a & { category: NonNullable<(typeof a)["category"]> } =>
      a.category !== null,
  );
  const name = (a: (typeof common)[number]) =>
    `${a.category.key}.${a.attributeDefinition.key}`;
  const bad = common.filter(
    (a) =>
      a.attributeDefinition.key !== "model" &&
      (a.category.matchingKey?.attributeKeys ?? ["uniqueId"]).includes(
        a.attributeDefinition.key,
      ),
  );
  console.log(`\n남은 필수 ${common.length}개 — ${common.map(name).join(" ")}`);
  console.log(
    bad.length === 0
      ? "✅ 필수인 매칭 키는 `model` 뿐"
      : `❌ 아직 필수인 매칭 키: ${bad.map(name).join(" ")}`,
  );
}

main();
