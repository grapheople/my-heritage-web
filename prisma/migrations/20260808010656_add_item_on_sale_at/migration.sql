-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "onSaleAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Item_saleStatus_onSaleAt_idx" ON "Item"("saleStatus", "onSaleAt");
