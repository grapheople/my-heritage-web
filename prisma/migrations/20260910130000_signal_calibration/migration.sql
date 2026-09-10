-- CreateTable
CREATE TABLE "SignalCalibration" (
    "id" TEXT NOT NULL,
    "lightId" TEXT NOT NULL,
    "profileLabel" TEXT,
    "greenStartAt" TIMESTAMP(3) NOT NULL,
    "driftSec" INTEGER NOT NULL,
    "liveState" TEXT NOT NULL,
    "liveRaw" JSONB NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalCalibration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignalCalibration_lightId_profileLabel_createdAt_idx" ON "SignalCalibration"("lightId", "profileLabel", "createdAt");

-- CreateIndex
CREATE INDEX "SignalCalibration_createdAt_idx" ON "SignalCalibration"("createdAt");
