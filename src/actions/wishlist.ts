"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { MAX_WISHLIST_ITEMS_PER_USER } from "@/lib/limits";

// Toggle rather than separate add/remove call sites in most UI - the button
// component tracks its own current state and picks which action to call.
// Both are idempotent (upsert / deleteMany) so a double-click or a stale
// client state can't error.

// Returned rather than thrown for the same reason as the loadout create
// paths - see the note in src/actions/loadouts.ts.
export type WishlistResult = { ok: true } | { ok: false; message: string };

export async function addToWishlist(skinId: string): Promise<WishlistResult> {
  const userId = await getCurrentUserId();

  // Only counted when this would be a new row. The unique index makes a repeat
  // add a no-op update, and a user already at the cap must still be able to
  // re-toggle something they already have.
  const existing = await prisma.wishlistItem.findUnique({
    where: { userId_skinId: { userId, skinId } },
    select: { userId: true },
  });
  if (!existing) {
    const count = await prisma.wishlistItem.count({ where: { userId } });
    if (count >= MAX_WISHLIST_ITEMS_PER_USER) {
      return {
        ok: false,
        message: `Your wishlist is full at ${MAX_WISHLIST_ITEMS_PER_USER} skins. Remove one to add another.`,
      };
    }
  }

  await prisma.wishlistItem.upsert({
    where: { userId_skinId: { userId, skinId } },
    create: { userId, skinId },
    update: {},
  });
  revalidatePath("/wishlist");
  revalidatePath(`/skins/${skinId}`);
  return { ok: true };
}

export async function removeFromWishlist(skinId: string): Promise<void> {
  const userId = await getCurrentUserId();
  await prisma.wishlistItem.deleteMany({ where: { userId, skinId } });
  revalidatePath("/wishlist");
  revalidatePath(`/skins/${skinId}`);
}
