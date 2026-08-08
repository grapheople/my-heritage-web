// .env.local 을 먼저 읽는다 — Next.js 와 순서를 맞춘다 (prisma/env.ts)
import "./env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * 시드 — 멱등해야 한다. 같은 시드를 두 번 넣어도 중복 생성되지 않는다.
 *
 * 여기 담는 것: 문서로 **확정된 마스터 데이터**만.
 *   · 카테고리 6개                   (D-007)
 *   · 공통 속성 라이브러리 14종      (item-catalog PRD F-02 확정표, D-010)
 *   · `condition` 선택지 5종         (policies/i18n §3 확정표)
 *   · 레벨 테이블 10레벨             (D-026)
 *
 * 여기 담지 않는 것:
 *   · 브랜드 마스터 290건 + alias ~900건 — PM 스프레드시트 → 별도 CSV import (D-045).
 *     **출시 블로커다.** 어드민 화면 기능이 아니라 일회성 스크립트로 만든다.
 *   · 카테고리별 매칭 키 (A-03)     — D-034 조사 미완. 옷·자전거·데스크테리어 미확정
 *   · 카테고리별 CategoryAttribute 조합 — 어드민이 운영에서 구성한다 (FR-02-A-01)
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/** D-007 — 6개 고정. key는 messages/*.json의 `category.*`와 일치해야 한다 */
const CATEGORIES = [
  "watch",
  "shoes",
  "bicycle",
  "apparel",
  "camping",
  "deskterior",
] as const;

/** item-catalog PRD F-02 "공통 속성 라이브러리 (확정 — D-010 초안 대체)" */
const COMMON_ATTRIBUTES = [
  { key: "brand", type: "select", ko: "브랜드", ja: "ブランド", en: "Brand" },
  { key: "model", type: "text", ko: "모델명", ja: "モデル名", en: "Model" },
  { key: "uniqueId", type: "text", ko: "고유번호", ja: "固有番号", en: "Reference No." },
  { key: "serialNo", type: "text", ko: "시리얼번호", ja: "シリアル番号", en: "Serial No." },
  { key: "purchasedFrom", type: "text", ko: "구매처", ja: "購入先", en: "Purchased from" },
  { key: "purchaseDate", type: "date", ko: "구매일", ja: "購入日", en: "Purchase date" },
  { key: "purchasePrice", type: "number", ko: "구매가", ja: "購入価格", en: "Purchase price" },
  { key: "condition", type: "select", ko: "상태", ja: "状態", en: "Condition" },
  { key: "color", type: "text", ko: "색상", ja: "カラー", en: "Color" },
  { key: "size", type: "text", ko: "사이즈", ja: "サイズ", en: "Size" },
  { key: "year", type: "number", ko: "제조년도", ja: "製造年", en: "Year" },
  { key: "accessories", type: "multiselect", ko: "포함 부속품", ja: "付属品", en: "Accessories" },
  { key: "note", type: "textarea", ko: "메모", ja: "メモ", en: "Note" },
  { key: "referenceUrl", type: "url", ko: "참고 링크", ja: "参考リンク", en: "Reference link" },
] as const;

/** policies/i18n §3 — `condition` 선택지 (확정, item-catalog F-04) */
const CONDITION_OPTIONS = [
  { key: "new", ko: "새제품", ja: "新品", en: "New" },
  { key: "unused", ko: "미사용", ja: "未使用", en: "Unused" },
  { key: "lightlyUsed", ko: "사용감 적음", ja: "使用感少", en: "Lightly used" },
  { key: "used", ko: "사용감 있음", ja: "使用感あり", en: "Used" },
  { key: "heavilyUsed", ko: "사용감 많음", ja: "使用感多", en: "Heavily used" },
] as const;

/**
 * `accessories` 선택지 — **ko만 확정**이다 (item-catalog F-02 비고: 박스·보증서·여분 링크·파우치·설명서).
 * ja/en은 **추측 기반**이므로 PM 컨펌 전까지 확정으로 취급하지 않는다.
 * TODO(OI): ja/en 라벨 확정 후 이 주석과 함께 제거.
 */
const ACCESSORY_OPTIONS = [
  { key: "box", ko: "박스", ja: "箱", en: "Box" },
  { key: "warranty", ko: "보증서", ja: "保証書", en: "Warranty card" },
  { key: "spareLinks", ko: "여분 링크", ja: "予備コマ", en: "Spare links" },
  { key: "pouch", ko: "파우치", ja: "ポーチ", en: "Pouch" },
  { key: "manual", ko: "설명서", ja: "説明書", en: "Manual" },
] as const;

async function main() {
  for (const [index, key] of CATEGORIES.entries()) {
    await prisma.category.upsert({
      where: { key },
      create: { key, displayOrder: index },
      update: { displayOrder: index },
    });
  }

  for (const attr of COMMON_ATTRIBUTES) {
    await prisma.attributeDefinition.upsert({
      where: { key: attr.key },
      create: {
        key: attr.key,
        type: attr.type,
        labelKo: attr.ko,
        labelJa: attr.ja,
        labelEn: attr.en,
        isCommon: true,
      },
      // 라벨만 갱신한다. key는 불변이고 유저가 입력한 값은 보존된다 (policies/i18n Case 3)
      update: { labelKo: attr.ko, labelJa: attr.ja, labelEn: attr.en },
    });
  }

  const optionSets = [
    { attributeKey: "condition", options: CONDITION_OPTIONS },
    { attributeKey: "accessories", options: ACCESSORY_OPTIONS },
  ];

  for (const { attributeKey, options } of optionSets) {
    const definition = await prisma.attributeDefinition.findUniqueOrThrow({
      where: { key: attributeKey },
    });
    for (const [index, option] of options.entries()) {
      await prisma.attributeOption.upsert({
        where: {
          attributeDefinitionId_key: {
            attributeDefinitionId: definition.id,
            key: option.key,
          },
        },
        create: {
          attributeDefinitionId: definition.id,
          key: option.key,
          labelKo: option.ko,
          labelJa: option.ja,
          labelEn: option.en,
          displayOrder: index,
        },
        update: {
          labelKo: option.ko,
          labelJa: option.ja,
          labelEn: option.en,
          displayOrder: index,
        },
      });
    }
  }

  // D-026 — 10레벨. 1일 최대 60exp.
  // ⚠️ 레벨별 필요 경험치 곡선은 leveling spec에서 확정되지 않았다 (A-09에서 어드민이 관리).
  //    아래 값은 자리만 잡은 것이므로 확정 테이블로 교체할 것.
  for (let level = 1; level <= 10; level += 1) {
    const requiredExp = (level - 1) * 600;
    await prisma.levelDefinition.upsert({
      where: { level },
      create: { level, requiredExp },
      update: {},
    });
  }

  console.log("seed done");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
