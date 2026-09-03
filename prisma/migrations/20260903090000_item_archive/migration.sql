-- D-296 — 추억함(아카이브).
--
-- 아이템을 지우지 않고 진열에서만 내린다. `NULL` 이면 진열 중이고, 값이
-- 있으면 그 시각에 보관됐다는 뜻이다.
--
-- ⚠️ 판매완료(`saleStatus = 'SOLD'`)와 **다른 축**이다. 떠난 아이템은
-- 소유권이 넘어간 것이고(D-023) 보관은 여전히 내 것이다 — 둘은 함께 성립한다.
--
-- ⚠️ 되돌릴 수 있다. 꺼내기는 이 값을 다시 `NULL` 로 만든다.

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Item_roomId_archivedAt_idx" ON "Item"("roomId", "archivedAt");
