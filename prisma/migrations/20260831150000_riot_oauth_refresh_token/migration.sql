-- AlterTable
ALTER TABLE "linked_riot_accounts" DROP COLUMN "encryptedSessionToken",
ADD COLUMN     "encryptedRefreshToken" TEXT NOT NULL,
ADD COLUMN     "refreshLockedUntil" TIMESTAMP(3);

