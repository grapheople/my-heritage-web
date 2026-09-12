-- 출근길 대중교통 — 지정한 역·정류장, 마지막 도착 스냅샷, 포털 호출 집계 (D-321).

-- CreateEnum
CREATE TYPE "TransitKind" AS ENUM ('SUBWAY', 'BUS');

-- CreateTable
CREATE TABLE "TransitFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "TransitKind" NOT NULL,
    "stopId" TEXT NOT NULL,
    "stopName" TEXT NOT NULL,
    "cityCode" TEXT NOT NULL DEFAULT '',
    "routeId" TEXT NOT NULL DEFAULT '',
    "routeName" TEXT NOT NULL DEFAULT '',
    "headsign" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransitFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransitArrival" (
    "id" TEXT NOT NULL,
    "favoriteId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "routeName" TEXT NOT NULL,
    "headsign" TEXT,
    "seq" INTEGER NOT NULL DEFAULT 1,
    "predictSec" INTEGER NOT NULL,
    "stopsLeft" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransitArrival_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransitPortalCall" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "target" TEXT,
    "requestedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransitPortalCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransitFavorite_userId_displayOrder_idx" ON "TransitFavorite"("userId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TransitFavorite_userId_kind_stopId_routeId_key" ON "TransitFavorite"("userId", "kind", "stopId", "routeId");

-- CreateIndex
CREATE INDEX "TransitArrival_favoriteId_idx" ON "TransitArrival"("favoriteId");

-- CreateIndex
CREATE UNIQUE INDEX "TransitArrival_favoriteId_routeId_seq_key" ON "TransitArrival"("favoriteId", "routeId", "seq");

-- CreateIndex
CREATE INDEX "TransitPortalCall_createdAt_idx" ON "TransitPortalCall"("createdAt");

-- CreateIndex
CREATE INDEX "TransitPortalCall_target_createdAt_idx" ON "TransitPortalCall"("target", "createdAt");

-- AddForeignKey
ALTER TABLE "TransitFavorite" ADD CONSTRAINT "TransitFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransitArrival" ADD CONSTRAINT "TransitArrival_favoriteId_fkey" FOREIGN KEY ("favoriteId") REFERENCES "TransitFavorite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
