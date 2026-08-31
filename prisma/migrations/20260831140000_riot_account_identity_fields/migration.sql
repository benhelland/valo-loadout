-- AlterTable
ALTER TABLE "linked_riot_accounts" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "puuid" TEXT,
ADD COLUMN     "riotGameName" TEXT,
ADD COLUMN     "riotTagLine" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "linked_riot_accounts_userId_puuid_key" ON "linked_riot_accounts"("userId", "puuid");

