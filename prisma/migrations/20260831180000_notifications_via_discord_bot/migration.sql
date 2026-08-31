
-- AlterEnum
BEGIN;
CREATE TYPE "NotificationChannel_new" AS ENUM ('DISCORD_DM');
ALTER TABLE "notifications_sent" ALTER COLUMN "channel" TYPE "NotificationChannel_new" USING ("channel"::text::"NotificationChannel_new");
ALTER TYPE "NotificationChannel" RENAME TO "NotificationChannel_old";
ALTER TYPE "NotificationChannel_new" RENAME TO "NotificationChannel";
DROP TYPE "public"."NotificationChannel_old";
COMMIT;

-- AlterTable
ALTER TABLE "linked_riot_accounts" DROP COLUMN "discordWebhookUrl",
ADD COLUMN     "expiryNotifiedAt" TIMESTAMP(3);

