-- DropIndex
DROP INDEX "notifications_sent_userId_skinId_sentAt_idx";

-- AlterTable
ALTER TABLE "notifications_sent" ADD COLUMN     "linkedRiotAccountId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notificationFailedAt" TIMESTAMP(3),
ADD COLUMN     "notificationFailureReason" TEXT,
ADD COLUMN     "wishlistNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "notifications_sent_userId_skinId_linkedRiotAccountId_sentAt_idx" ON "notifications_sent"("userId", "skinId", "linkedRiotAccountId", "sentAt");

-- AddForeignKey
ALTER TABLE "notifications_sent" ADD CONSTRAINT "notifications_sent_linkedRiotAccountId_fkey" FOREIGN KEY ("linkedRiotAccountId") REFERENCES "linked_riot_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
