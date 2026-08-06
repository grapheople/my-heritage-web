-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('ko', 'ja', 'en');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('KRW', 'JPY', 'USD');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE', 'APPLE');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ItemSaleStatus" AS ENUM ('DISPLAYED', 'ON_SALE', 'SOLD');

-- CreateEnum
CREATE TYPE "SanctionLevel" AS ENUM ('WARNING', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "AttributeType" AS ENUM ('text', 'textarea', 'number', 'select', 'multiselect', 'date', 'boolean', 'url');

-- CreateEnum
CREATE TYPE "CodexVerification" AS ENUM ('UNVERIFIED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('ITEM', 'DIARY', 'ROOM', 'CODEX', 'EXTERNAL_LINK');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BrandRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExperienceReason" AS ENUM ('LOGIN', 'ITEM_CREATE', 'DIARY_CREATE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT,
    "language" "Locale" NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "imageUrl" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sanction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" "SanctionLevel" NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "previousRoomVisibility" "Visibility",
    "issuedBy" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedBy" TEXT,
    "liftedAt" TIMESTAMP(3),

    CONSTRAINT "Sanction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "AttributeType" NOT NULL,
    "labelKo" TEXT NOT NULL,
    "labelJa" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "unitKo" TEXT,
    "unitJa" TEXT,
    "unitEn" TEXT,
    "isCommon" BOOLEAN NOT NULL DEFAULT false,
    "validation" JSONB,

    CONSTRAINT "AttributeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryAttribute" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "attributeDefinitionId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CategoryAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeOption" (
    "id" TEXT NOT NULL,
    "attributeDefinitionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "labelKo" TEXT NOT NULL,
    "labelJa" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AttributeOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requestedName" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "status" "BrandRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchingKeyDefinition" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "attributeKeys" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchingKeyDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchingKeyChangeLog" (
    "id" TEXT NOT NULL,
    "matchingKeyDefinitionId" TEXT NOT NULL,
    "before" TEXT[],
    "after" TEXT[],
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchingKeyChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodexItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "uniqueId" TEXT,
    "normalizedKey" TEXT NOT NULL,
    "aliases" JSONB NOT NULL DEFAULT '{}',
    "description" TEXT,
    "descriptions" JSONB,
    "verification" "CodexVerification" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "mergedIntoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodexItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "brandId" TEXT,
    "model" TEXT,
    "codexItemId" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "saleStatus" "ItemSaleStatus" NOT NULL DEFAULT 'DISPLAYED',
    "price" DECIMAL(14,2),
    "currency" "Currency",
    "externalUrl" TEXT,
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPhoto" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ItemPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemAttributeValue" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "categoryAttributeId" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "ItemAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diary" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Diary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiaryPhoto" (
    "id" TEXT NOT NULL,
    "diaryId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DiaryPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiaryItem" (
    "diaryId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "DiaryItem_pkey" PRIMARY KEY ("diaryId","itemId")
);

-- CreateTable
CREATE TABLE "LevelDefinition" (
    "level" INTEGER NOT NULL,
    "requiredExp" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LevelDefinition_pkey" PRIMARY KEY ("level")
);

-- CreateTable
CREATE TABLE "ExperienceLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" "ExperienceReason" NOT NULL,
    "amount" INTEGER NOT NULL,
    "localDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperienceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "handledBy" TEXT,
    "handledAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BrandToCategory" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BrandToCategory_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "User_language_idx" ON "User"("language");

-- CreateIndex
CREATE UNIQUE INDEX "User_provider_subject_key" ON "User"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "Room_userId_key" ON "Room"("userId");

-- CreateIndex
CREATE INDEX "Room_visibility_idx" ON "Room"("visibility");

-- CreateIndex
CREATE INDEX "Sanction_userId_liftedAt_idx" ON "Sanction"("userId", "liftedAt");

-- CreateIndex
CREATE INDEX "Sanction_expiresAt_idx" ON "Sanction"("expiresAt");

-- CreateIndex
CREATE INDEX "Block_blockedId_idx" ON "Block"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "Block_blockerId_blockedId_key" ON "Block"("blockerId", "blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_key_key" ON "Category"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeDefinition_key_key" ON "AttributeDefinition"("key");

-- CreateIndex
CREATE INDEX "CategoryAttribute_categoryId_active_displayOrder_idx" ON "CategoryAttribute"("categoryId", "active", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryAttribute_categoryId_attributeDefinitionId_key" ON "CategoryAttribute"("categoryId", "attributeDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeOption_attributeDefinitionId_key_key" ON "AttributeOption"("attributeDefinitionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE INDEX "BrandRequest_status_createdAt_idx" ON "BrandRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchingKeyDefinition_categoryId_key" ON "MatchingKeyDefinition"("categoryId");

-- CreateIndex
CREATE INDEX "CodexItem_verification_idx" ON "CodexItem"("verification");

-- CreateIndex
CREATE INDEX "CodexItem_uniqueId_idx" ON "CodexItem"("uniqueId");

-- CreateIndex
CREATE UNIQUE INDEX "CodexItem_categoryId_normalizedKey_key" ON "CodexItem"("categoryId", "normalizedKey");

-- CreateIndex
CREATE INDEX "Item_visibility_saleStatus_createdAt_idx" ON "Item"("visibility", "saleStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Item_roomId_categoryId_idx" ON "Item"("roomId", "categoryId");

-- CreateIndex
CREATE INDEX "Item_codexItemId_idx" ON "Item"("codexItemId");

-- CreateIndex
CREATE INDEX "ItemPhoto_itemId_displayOrder_idx" ON "ItemPhoto"("itemId", "displayOrder");

-- CreateIndex
CREATE INDEX "ItemAttributeValue_categoryAttributeId_idx" ON "ItemAttributeValue"("categoryAttributeId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemAttributeValue_itemId_categoryAttributeId_key" ON "ItemAttributeValue"("itemId", "categoryAttributeId");

-- CreateIndex
CREATE INDEX "Diary_roomId_visibility_createdAt_idx" ON "Diary"("roomId", "visibility", "createdAt");

-- CreateIndex
CREATE INDEX "DiaryPhoto_diaryId_displayOrder_idx" ON "DiaryPhoto"("diaryId", "displayOrder");

-- CreateIndex
CREATE INDEX "DiaryItem_itemId_idx" ON "DiaryItem"("itemId");

-- CreateIndex
CREATE INDEX "ExperienceLog_userId_createdAt_idx" ON "ExperienceLog"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceLog_userId_reason_localDate_key" ON "ExperienceLog"("userId", "reason", "localDate");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "_BrandToCategory_B_index" ON "_BrandToCategory"("B");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sanction" ADD CONSTRAINT "Sanction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAttribute" ADD CONSTRAINT "CategoryAttribute_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAttribute" ADD CONSTRAINT "CategoryAttribute_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "AttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeOption" ADD CONSTRAINT "AttributeOption_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandRequest" ADD CONSTRAINT "BrandRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchingKeyDefinition" ADD CONSTRAINT "MatchingKeyDefinition_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchingKeyChangeLog" ADD CONSTRAINT "MatchingKeyChangeLog_matchingKeyDefinitionId_fkey" FOREIGN KEY ("matchingKeyDefinitionId") REFERENCES "MatchingKeyDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodexItem" ADD CONSTRAINT "CodexItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodexItem" ADD CONSTRAINT "CodexItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodexItem" ADD CONSTRAINT "CodexItem_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "CodexItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_codexItemId_fkey" FOREIGN KEY ("codexItemId") REFERENCES "CodexItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPhoto" ADD CONSTRAINT "ItemPhoto_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAttributeValue" ADD CONSTRAINT "ItemAttributeValue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAttributeValue" ADD CONSTRAINT "ItemAttributeValue_categoryAttributeId_fkey" FOREIGN KEY ("categoryAttributeId") REFERENCES "CategoryAttribute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diary" ADD CONSTRAINT "Diary_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryPhoto" ADD CONSTRAINT "DiaryPhoto_diaryId_fkey" FOREIGN KEY ("diaryId") REFERENCES "Diary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryItem" ADD CONSTRAINT "DiaryItem_diaryId_fkey" FOREIGN KEY ("diaryId") REFERENCES "Diary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryItem" ADD CONSTRAINT "DiaryItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceLog" ADD CONSTRAINT "ExperienceLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BrandToCategory" ADD CONSTRAINT "_BrandToCategory_A_fkey" FOREIGN KEY ("A") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BrandToCategory" ADD CONSTRAINT "_BrandToCategory_B_fkey" FOREIGN KEY ("B") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
