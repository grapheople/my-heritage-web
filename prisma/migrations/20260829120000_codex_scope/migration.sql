-- D-253·D-254 — 도감 유일성을 카테고리 단위에서 **스코프 단위**로 옮긴다.
--
-- ⚠️ scopeId 는 GENERATED ALWAYS 다. Prisma 가 낸 `ADD COLUMN "scopeId" TEXT NOT NULL`
-- 을 그대로 쓰지 않는다 — 그러면 기존 1,052 행에 넣을 값이 없어 실패하고,
-- 무엇보다 **앱이 값을 틀리게 넣을 수 있다.**
--
-- ⚠️ 그냥 @@unique([categoryId, subtypeId, normalizedKey]) 로 두지 않는 이유:
-- Postgres 에서 NULL 은 서로 다른 값이라 subtypeId 가 NULL 인 행끼리는
-- 유니크에 걸리지 않는다. 생성 컬럼은 절대 NULL 이 아니므로 그 구멍이 없다.

ALTER TABLE "CodexItem" ADD COLUMN "subtypeId" TEXT;

ALTER TABLE "CodexItem"
  ADD COLUMN "scopeId" TEXT
  GENERATED ALWAYS AS (COALESCE("subtypeId", "categoryId")) STORED;

DROP INDEX "CodexItem_categoryId_normalizedKey_key";

CREATE UNIQUE INDEX "CodexItem_scopeId_normalizedKey_key"
  ON "CodexItem"("scopeId", "normalizedKey");

CREATE INDEX "CodexItem_subtypeId_idx" ON "CodexItem"("subtypeId");

ALTER TABLE "CodexItem" ADD CONSTRAINT "CodexItem_subtypeId_fkey"
  FOREIGN KEY ("subtypeId") REFERENCES "CategorySubtype"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
