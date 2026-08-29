-- D-253~D-255 — 매칭 키 스코프 + 브랜드 연결을 명시 조인으로.
--
-- ⚠️ **순서가 중요하다.** Prisma 가 낸 diff 는 `_BrandToCategory` 를 그냥 DROP 한다.
-- 그러면 기존 312 개 연결이 사라져 **전 카테고리 등록 폼의 브랜드 목록이 빈다.**
-- 옮기고 나서 지운다.

-- ── 1. CodexMatchKey 스코프 ───────────────────────────────────────────────
ALTER TABLE "CodexMatchKey" ADD COLUMN "subtypeId" TEXT;

ALTER TABLE "CodexMatchKey"
  ADD COLUMN "scopeId" TEXT
  GENERATED ALWAYS AS (COALESCE("subtypeId", "categoryId")) STORED;

DROP INDEX "CodexMatchKey_categoryId_value_key";

CREATE UNIQUE INDEX "CodexMatchKey_scopeId_value_key"
  ON "CodexMatchKey"("scopeId", "value");

CREATE INDEX "CodexMatchKey_subtypeId_idx" ON "CodexMatchKey"("subtypeId");

ALTER TABLE "CodexMatchKey" ADD CONSTRAINT "CodexMatchKey_subtypeId_fkey"
  FOREIGN KEY ("subtypeId") REFERENCES "CategorySubtype"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 2. BrandScope 신설 ────────────────────────────────────────────────────
CREATE TABLE "BrandScope" (
  "id"         TEXT NOT NULL,
  "brandId"    TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "subtypeId"  TEXT,
  "scopeId"    TEXT GENERATED ALWAYS AS (COALESCE("subtypeId", "categoryId")) STORED,
  CONSTRAINT "BrandScope_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BrandScope_scopeId_idx"    ON "BrandScope"("scopeId");
CREATE INDEX "BrandScope_categoryId_idx" ON "BrandScope"("categoryId");
CREATE UNIQUE INDEX "BrandScope_brandId_scopeId_key" ON "BrandScope"("brandId", "scopeId");

ALTER TABLE "BrandScope" ADD CONSTRAINT "BrandScope_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrandScope" ADD CONSTRAINT "BrandScope_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrandScope" ADD CONSTRAINT "BrandScope_subtypeId_fkey"
  FOREIGN KEY ("subtypeId") REFERENCES "CategorySubtype"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 3. 기존 연결 이관 — 지우기 **전에** ──────────────────────────────────
-- 포함적 scope 라 subtypeId 를 null 로 두면 동작이 완전히 같다 (D-255).
-- id 는 cuid 가 아니지만 앱이 생성하지 않는 행이라 무방하다.
INSERT INTO "BrandScope" ("id", "brandId", "categoryId", "subtypeId")
SELECT 'bs_' || md5("A" || ':' || "B"), "A", "B", NULL
FROM "_BrandToCategory";

-- ── 4. 옛 조인 제거 ───────────────────────────────────────────────────────
DROP TABLE "_BrandToCategory";
