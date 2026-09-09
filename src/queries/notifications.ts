import { prisma } from "@/lib/db";

// Backs the notification controls on /account. The opt-out flag and the
// delivery-failure state come back together because the toggle and the
// failure banner render from the same fetch.

export interface NotificationStatus {
  wishlistNotificationsEnabled: boolean;
  notificationFailedAt: Date | null;
  /** A DeliveryFailureReason - see src/discord/bot.ts. */
  notificationFailureReason: string | null;
}

export async function getNotificationStatus(userId: string): Promise<NotificationStatus | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      wishlistNotificationsEnabled: true,
      notificationFailedAt: true,
      notificationFailureReason: true,
    },
  });
}
