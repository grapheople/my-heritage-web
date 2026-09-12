-- 정류장에서 보지 않기로 한 노선 — 지우지 않고 숨긴다 (D-324).

-- CreateTable
CREATE TABLE "TransitHiddenRoute" (
    "id" TEXT NOT NULL,
    "favoriteId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "routeName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransitHiddenRoute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransitHiddenRoute_favoriteId_idx" ON "TransitHiddenRoute"("favoriteId");

-- CreateIndex
CREATE UNIQUE INDEX "TransitHiddenRoute_favoriteId_routeId_key" ON "TransitHiddenRoute"("favoriteId", "routeId");

-- AddForeignKey
ALTER TABLE "TransitHiddenRoute" ADD CONSTRAINT "TransitHiddenRoute_favoriteId_fkey" FOREIGN KEY ("favoriteId") REFERENCES "TransitFavorite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
