-- CreateTable
CREATE TABLE "WearShot" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "note" TEXT,
    "wornOn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WearShot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WearShot_itemId_wornOn_idx" ON "WearShot"("itemId", "wornOn");

-- CreateIndex
CREATE UNIQUE INDEX "WearShot_itemId_wornOn_key" ON "WearShot"("itemId", "wornOn");

-- AddForeignKey
ALTER TABLE "WearShot" ADD CONSTRAINT "WearShot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
