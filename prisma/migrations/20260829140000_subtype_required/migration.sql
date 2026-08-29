-- D-253 — 종류 선택 필수 여부를 **데이터로** 둔다.
--
-- ⚠️ 카테고리를 코드에 열거하지 않는다 (D-173·D-231). sellable ·
-- requiresPhoto · userCodexCreation 과 같은 자리다.
--
-- ⚠️ 기본이 false 다 — 나머지 셋과 반대다. 켜는 순간 등록 단계가 하나
-- 늘어나므로, 종류를 갖추고 도감을 분류한 카테고리에서만 켠다.

ALTER TABLE "Category" ADD COLUMN "subtypeRequired" BOOLEAN NOT NULL DEFAULT false;

-- 생성 컬럼은 절대 NULL 이 아니지만 컬럼 선언에 NOT NULL 이 빠져 있었다.
-- Prisma 스키마(String, 옵셔널 아님)와 맞춘다.
ALTER TABLE "CodexItem"     ALTER COLUMN "scopeId" SET NOT NULL;
ALTER TABLE "CodexMatchKey" ALTER COLUMN "scopeId" SET NOT NULL;
ALTER TABLE "BrandScope"    ALTER COLUMN "scopeId" SET NOT NULL;

-- ⚠️ 자전거만 켠다. 캠핑은 도감 208건 분류 후 (D-257).
UPDATE "Category" SET "subtypeRequired" = true WHERE "key" = 'bicycle';
