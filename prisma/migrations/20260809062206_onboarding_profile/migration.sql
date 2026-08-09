-- AlterTable
ALTER TABLE "User" ALTER COLUMN "timezone" DROP NOT NULL,
ALTER COLUMN "timezone" DROP DEFAULT;

-- ⚠️ 기존 행의 'UTC' 는 **유저가 고른 값이 아니라 스키마 기본값**이다 (D-122).
-- 그대로 두면 "이미 수집됨"으로 읽혀 FR-09-C-04 가 영영 덮지 않는다 —
-- 즉 기존 유저는 영원히 UTC 로 남고, 경험치 1일 경계가 계속 틀린다.
--
-- 타임존을 **설정할 수 있는 화면이 지금까지 없었으므로** 'UTC' 를 의도적으로
-- 고른 유저는 존재할 수 없다. 전부 미수집으로 되돌린다.
UPDATE "User" SET "timezone" = NULL WHERE "timezone" = 'UTC';

-- CreateTable
CREATE TABLE "_userPreferredCategories" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_userPreferredCategories_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_userPreferredCategories_B_index" ON "_userPreferredCategories"("B");

-- AddForeignKey
ALTER TABLE "_userPreferredCategories" ADD CONSTRAINT "_userPreferredCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_userPreferredCategories" ADD CONSTRAINT "_userPreferredCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
