"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

// Returned rather than thrown for the same reason as the loadout create
// paths - see the note in src/actions/loadouts.ts.
export type NotificationSettingsResult = { ok: true } | { ok: false; message: string };

/**
 * Mutes or unmutes wishlist-match DMs. The link-expiry warning is
 * deliberately outside this switch: it says the thing the user set up has
 * stopped working, which is not noise to opt out of.
 */
export async function setWishlistNotificationsEnabled(enabled: boolean): Promise<NotificationSettingsResult> {
  const userId = await getCurrentUserId();

  // Server Action arguments deserialize from the client and are not runtime
  // checked, so anything but a literal true is treated as off.
  const value = enabled === true;

  try {
    await prisma.user.update({ where: { id: userId }, data: { wishlistNotificationsEnabled: value } });
  } catch {
    return { ok: false, message: "Couldn't save that setting. Try again in a moment." };
  }

  revalidatePath("/account");
  return { ok: true };
}
