-- CreateEnum
CREATE TYPE "MatchKeyKind" AS ENUM ('PRIMARY', 'ALIAS');

-- CreateEnum
CREATE TYPE "MatchKeySource" AS ENUM ('SYSTEM', 'MERGE', 'ADMIN', 'AI_APPROVED');

-- CreateEnum
CREATE TYPE "MatchOutcome" AS ENUM ('EXACT', 'KEY_ALIAS', 'CREATED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'NEW_FOLLOWER';
ALTER TYPE "NotificationType" ADD VALUE 'WEAR_SHOT_COMMENT';

-- AlterEnum
ALTER TYPE "ReportTargetType" ADD VALUE 'COMMENT';

-- AlterTable
ALTER TABLE "AttributeOption" ADD COLUMN     "categoryId" TEXT;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "requiresPhoto" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sellable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "CategoryAttribute" ADD COLUMN     "labelEn" TEXT,
ADD COLUMN     "labelJa" TEXT,
ADD COLUMN     "labelKo" TEXT,
ADD COLUMN     "subtypeId" TEXT,
ALTER COLUMN "categoryId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CodexItem" ADD COLUMN     "mergedItemIds" JSONB;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "subtypeId" TEXT;

-- AlterTable
ALTER TABLE "MatchingKeyDefinition" ADD COLUMN     "subtypeId" TEXT,
ALTER COLUMN "categoryId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "wearShotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorySubtype" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "labelKo" TEXT NOT NULL,
    "labelJa" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CategorySubtype_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodexMatchKey" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "codexItemId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "kind" "MatchKeyKind" NOT NULL,
    "source" "MatchKeySource" NOT NULL,
    "sourceMergeId" TEXT,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodexMatchKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodexMerge" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "survivorId" TEXT NOT NULL,
    "absorbed" JSONB NOT NULL,
    "mergedBy" TEXT NOT NULL,
    "mergedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertedBy" TEXT,
    "revertedAt" TIMESTAMP(3),

    CONSTRAINT "CodexMerge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodexMatchLog" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "brandId" TEXT,
    "attempted" TEXT NOT NULL,
    "outcome" "MatchOutcome" NOT NULL,
    "searchHits" INTEGER,
    "topHitCodexId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodexMatchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineExercise" (
    "id" TEXT NOT NULL,
    "routineItemId" TEXT NOT NULL,
    "exerciseItemId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutineExercise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comment_wearShotId_createdAt_idx" ON "Comment"("wearShotId", "createdAt");

-- CreateIndex
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followingId_key" ON "Follow"("followerId", "followingId");

-- CreateIndex
CREATE INDEX "CategorySubtype_categoryId_active_displayOrder_idx" ON "CategorySubtype"("categoryId", "active", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CategorySubtype_categoryId_key_key" ON "CategorySubtype"("categoryId", "key");

-- CreateIndex
CREATE INDEX "CodexMatchKey_codexItemId_idx" ON "CodexMatchKey"("codexItemId");

-- CreateIndex
CREATE INDEX "CodexMatchKey_sourceMergeId_idx" ON "CodexMatchKey"("sourceMergeId");

-- CreateIndex
CREATE UNIQUE INDEX "CodexMatchKey_categoryId_value_key" ON "CodexMatchKey"("categoryId", "value");

-- CreateIndex
CREATE INDEX "CodexMerge_survivorId_idx" ON "CodexMerge"("survivorId");

-- CreateIndex
CREATE INDEX "CodexMerge_categoryId_mergedAt_idx" ON "CodexMerge"("categoryId", "mergedAt");

-- CreateIndex
CREATE INDEX "CodexMatchLog_categoryId_outcome_createdAt_idx" ON "CodexMatchLog"("categoryId", "outcome", "createdAt");

-- CreateIndex
CREATE INDEX "CodexMatchLog_categoryId_attempted_idx" ON "CodexMatchLog"("categoryId", "attempted");

-- CreateIndex
CREATE INDEX "RoutineExercise_routineItemId_displayOrder_idx" ON "RoutineExercise"("routineItemId", "displayOrder");

-- CreateIndex
CREATE INDEX "RoutineExercise_exerciseItemId_idx" ON "RoutineExercise"("exerciseItemId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineExercise_routineItemId_exerciseItemId_key" ON "RoutineExercise"("routineItemId", "exerciseItemId");

-- CreateIndex
CREATE INDEX "CategoryAttribute_subtypeId_active_displayOrder_idx" ON "CategoryAttribute"("subtypeId", "active", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryAttribute_subtypeId_attributeDefinitionId_key" ON "CategoryAttribute"("subtypeId", "attributeDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchingKeyDefinition_subtypeId_key" ON "MatchingKeyDefinition"("subtypeId");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_wearShotId_fkey" FOREIGN KEY ("wearShotId") REFERENCES "WearShot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorySubtype" ADD CONSTRAINT "CategorySubtype_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAttribute" ADD CONSTRAINT "CategoryAttribute_subtypeId_fkey" FOREIGN KEY ("subtypeId") REFERENCES "CategorySubtype"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeOption" ADD CONSTRAINT "AttributeOption_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchingKeyDefinition" ADD CONSTRAINT "MatchingKeyDefinition_subtypeId_fkey" FOREIGN KEY ("subtypeId") REFERENCES "CategorySubtype"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodexMatchKey" ADD CONSTRAINT "CodexMatchKey_codexItemId_fkey" FOREIGN KEY ("codexItemId") REFERENCES "CodexItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodexMatchKey" ADD CONSTRAINT "CodexMatchKey_sourceMergeId_fkey" FOREIGN KEY ("sourceMergeId") REFERENCES "CodexMerge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodexMerge" ADD CONSTRAINT "CodexMerge_survivorId_fkey" FOREIGN KEY ("survivorId") REFERENCES "CodexItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_subtypeId_fkey" FOREIGN KEY ("subtypeId") REFERENCES "CategorySubtype"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineExercise" ADD CONSTRAINT "RoutineExercise_routineItemId_fkey" FOREIGN KEY ("routineItemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineExercise" ADD CONSTRAINT "RoutineExercise_exerciseItemId_fkey" FOREIGN KEY ("exerciseItemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
