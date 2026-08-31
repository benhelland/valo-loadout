"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

// Toggle rather than separate add/remove call sites in most UI - the button
// component tracks its own current state and picks which action to call.
// Both are idempotent (upsert / deleteMany) so a double-click or a stale
// client state can't error.

export async function addToWishlist(skinId: string): Promise<void> {
  const userId = await getCurrentUserId();
  await prisma.wishlistItem.upsert({
    where: { userId_skinId: { userId, skinId } },
    create: { userId, skinId },
    update: {},
  });
  revalidatePath("/wishlist");
  revalidatePath(`/skins/${skinId}`);
}

export async function removeFromWishlist(skinId: string): Promise<void> {
  const userId = await getCurrentUserId();
  await prisma.wishlistItem.deleteMany({ where: { userId, skinId } });
  revalidatePath("/wishlist");
  revalidatePath(`/skins/${skinId}`);
}
