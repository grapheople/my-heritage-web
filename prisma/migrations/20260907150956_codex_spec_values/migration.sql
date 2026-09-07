-- CreateEnum
CREATE TYPE "CodexSpecSource" AS ENUM ('ADMIN', 'RESEARCH', 'DERIVED');

-- AlterTable
ALTER TABLE "AttributeDefinition" ADD COLUMN     "isSpec" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CodexAttributeValue" (
    "id" TEXT NOT NULL,
    "codexItemId" TEXT NOT NULL,
    "attributeDefinitionId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "source" "CodexSpecSource" NOT NULL,
    "sampleSize" INTEGER,
    "agreement" INTEGER,
    "derivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodexAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CodexAttributeValue_attributeDefinitionId_idx" ON "CodexAttributeValue"("attributeDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "CodexAttributeValue_codexItemId_attributeDefinitionId_key" ON "CodexAttributeValue"("codexItemId", "attributeDefinitionId");

-- AddForeignKey
ALTER TABLE "CodexAttributeValue" ADD CONSTRAINT "CodexAttributeValue_codexItemId_fkey" FOREIGN KEY ("codexItemId") REFERENCES "CodexItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodexAttributeValue" ADD CONSTRAINT "CodexAttributeValue_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "AttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
