-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedBy" TEXT,
ADD COLUMN     "invitedBy" TEXT;

