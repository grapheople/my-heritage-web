-- 교차로 찾기 — 목록 캐시 · 실시간 대상 선택 · 포털 호출 집계.

-- CreateEnum
CREATE TYPE "SignalPortalEndpoint" AS ENUM ('SIGNAL_PHASE', 'CROSSROAD_MAP');

-- CreateTable
CREATE TABLE "SignalPortalCall" (
    "id" TEXT NOT NULL,
    "endpoint" "SignalPortalEndpoint" NOT NULL,
    "target" TEXT,
    "requestedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalPortalCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalIntersection" (
    "itstId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "engName" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "laneWidth" INTEGER,
    "limitSpeed" INTEGER,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalIntersection_pkey" PRIMARY KEY ("itstId")
);

-- CreateTable
CREATE TABLE "SignalLightLive" (
    "lightId" TEXT NOT NULL,
    "itstId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignalLightLive_pkey" PRIMARY KEY ("lightId")
);

-- CreateIndex
CREATE INDEX "SignalPortalCall_createdAt_idx" ON "SignalPortalCall"("createdAt");

-- CreateIndex
CREATE INDEX "SignalPortalCall_target_createdAt_idx" ON "SignalPortalCall"("target", "createdAt");

-- CreateIndex
CREATE INDEX "SignalIntersection_lat_lon_idx" ON "SignalIntersection"("lat", "lon");

-- CreateIndex
CREATE INDEX "SignalIntersection_name_idx" ON "SignalIntersection"("name");

-- CreateIndex
CREATE INDEX "SignalLightLive_itstId_idx" ON "SignalLightLive"("itstId");
