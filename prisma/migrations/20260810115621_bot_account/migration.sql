-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isBot" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BotAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "loginId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActedAt" TIMESTAMP(3),

    CONSTRAINT "BotAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BotAccount_userId_key" ON "BotAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BotAccount_loginId_key" ON "BotAccount"("loginId");

-- AddForeignKey
ALTER TABLE "BotAccount" ADD CONSTRAINT "BotAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
