import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

// Reads the shop a check already stored, rather than calling Riot.
//
// Viewing your shop must never trigger an outbound Riot request: a page view
// is user-driven and unbounded, and CLAUDE.md's rate-limit rule exists
// precisely to keep this app's request volume tied to the once-a-day poll
// rather than to traffic. The data is already durable - runShopCheck upserts
// a SkinSightingStat per observed skin and stamps lastSyncedAt on the
// account - so this is a plain database read. Refreshing on demand is a
// separate, explicit action (the "check shop now" button).

// The full relation set SkinCard expects, so the shop grid reuses the same
// card as the gallery rather than a parallel one that would drift from it on
// price formatting, rarity colour and the wishlist control.
export type ShopSkin = Prisma.SkinGetPayload<{
  include: { weapon: true; contentTier: true; theme: true; levels: true; chromas: true };
}> & { onWishlist: boolean };

export type ShopView = {
  linked: boolean;
  riotId: string | null;
  status: string | null;
  lastSyncedAt: Date | null;
  nextPollAt: Date | null;
  skins: ShopSkin[];
};

export async function getShopForUser(userId: string): Promise<ShopView> {
  // Named columns rather than the whole row: linked_riot_accounts holds
  // `encryptedRefreshToken`, and there is no reason for the stored credential
  // to travel into a page render that never reads it.
  const account = await prisma.linkedRiotAccount.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      riotGameName: true,
      riotTagLine: true,
      status: true,
      lastSyncedAt: true,
      nextPollAt: true,
    },
  });

  if (!account) {
    return { linked: false, riotId: null, status: null, lastSyncedAt: null, nextPollAt: null, skins: [] };
  }

  const base = {
    linked: true,
    riotId: account.riotGameName ? `${account.riotGameName}#${account.riotTagLine ?? "?"}` : null,
    status: account.status as string,
    lastSyncedAt: account.lastSyncedAt,
    nextPollAt: account.nextPollAt,
  };

  if (!account.lastSyncedAt) return { ...base, skins: [] };

  // Only rows touched by the most recent check. Ordering by lastSeenAt alone
  // and taking four would silently pad a short result with skins from an
  // earlier rotation - the slack absorbs the small spread between the
  // per-skin upserts and the account stamp, which are not written atomically.
  const cutoff = new Date(account.lastSyncedAt.getTime() - 5 * 60_000);

  // payload-ok: one account's most recent rotation only - four offers.
  const sightings = await prisma.skinSightingStat.findMany({
    where: { linkedRiotAccountId: account.id, lastSeenAt: { gte: cutoff } },
    orderBy: { lastSeenAt: "desc" },
    include: {
      skin: { include: { weapon: true, contentTier: true, theme: true, levels: true, chromas: true } },
    },
  });

  // One query for the cross-reference rather than one per card - the same
  // pattern the gallery and wishlist already use.
  const wishlisted = new Set(
    (
      await prisma.wishlistItem.findMany({
        where: { userId, skinId: { in: sightings.map((s) => s.skinId) } },
        select: { skinId: true },
      })
    ).map((w) => w.skinId),
  );

  return {
    ...base,
    skins: sightings.map((s) => ({ ...s.skin, onWishlist: wishlisted.has(s.skinId) })),
  };
}
