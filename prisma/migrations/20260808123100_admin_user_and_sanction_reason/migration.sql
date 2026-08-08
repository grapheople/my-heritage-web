-- CreateEnum
CREATE TYPE "SanctionReason" AS ENUM ('FAKE', 'STOLEN', 'WEAPON', 'DRUG', 'ALCOHOL', 'NON_PHYSICAL', 'PHISHING', 'INAPPROPRIATE', 'WRONG_INFO', 'REPEATED', 'OTHER');

-- AlterTable (D-103)
-- ⚠️ 기존 자유 텍스트 사유를 버리지 않는다. detail 로 옮기고 reasonCode 는
--    OTHER 로 채운다 — 옛 값이 어떤 enum 인지 서버가 알 수 없기 때문이다.
--    OTHER 로 남으면 운영이 나중에 정정할 수 있지만, 지우면 복구가 불가능하다.
ALTER TABLE "Sanction" ADD COLUMN "detail" TEXT;
ALTER TABLE "Sanction" ADD COLUMN "reasonCode" "SanctionReason";

UPDATE "Sanction" SET "detail" = "reason", "reasonCode" = 'OTHER';

ALTER TABLE "Sanction" ALTER COLUMN "reasonCode" SET NOT NULL;
ALTER TABLE "Sanction" DROP COLUMN "reason";

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminUser_active_idx" ON "AdminUser"("active");

