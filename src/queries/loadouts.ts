import { prisma } from "@/lib/db";
import { totalSkinPrice } from "@/lib/pricing";
import { getPriceEstimates } from "@/queries/prices";

const itemInclude = {
  weapon: true,
  skin: { include: { contentTier: true } },
  level: true,
  chroma: true,
  buddy: true,
} as const;

// The item's `weapon` is the slot's weapon, which is by construction the
// skin's own weapon - so it's what tells resolveSkinPrice whether this is a
// melee skin (which has no reliable estimate; see src/lib/pricing.ts).
async function loadoutPriceTotal(
  items: { skin: { priceVp: number | null; contentTier: { devName: string } | null }; weapon: { category: string | null } }[],
) {
  return totalSkinPrice(items.map((item) => ({ ...item.skin, weapon: item.weapon })), await getPriceEstimates());
}

export async function listLoadouts(userId: string) {
  const loadouts = await prisma.loadout.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { items: { include: itemInclude } },
  });

  return Promise.all(
    loadouts.map(async (loadout) => ({
      ...loadout,
      priceTotal: await loadoutPriceTotal(loadout.items),
    })),
  );
}

// Returns null if the loadout doesn't exist OR isn't owned by this user -
// callers should treat both the same way (404), never leak which one it was.
export async function getLoadout(id: string, userId: string) {
  const loadout = await prisma.loadout.findUnique({
    where: { id },
    include: { items: { include: itemInclude } },
  });

  if (!loadout || loadout.userId !== userId) return null;

  return { ...loadout, priceTotal: await loadoutPriceTotal(loadout.items) };
}

export async function listAllWeapons() {
  return prisma.weapon.findMany({ orderBy: { displayName: "asc" } });
}

// Public, unauthenticated lookup for /l/:shareSlug. Deliberately takes no
// userId: anyone with the link can view it. Requires isShareable to still
// be true, so revoking works even if a slug were somehow retained.
export async function getSharedLoadout(shareSlug: string) {
  const loadout = await prisma.loadout.findUnique({
    where: { shareSlug },
    include: { items: { include: itemInclude } },
  });
  if (!loadout || !loadout.isShareable) return null;
  return { ...loadout, priceTotal: await loadoutPriceTotal(loadout.items) };
}

// Lightweight - just id/name, for the loadout switcher dropdown. Avoids
// pulling every loadout's full item tree just to populate a <select>.
export async function listLoadoutSummaries(userId: string) {
  return prisma.loadout.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Which of this user's loadouts each of the given skins is assigned in.
 * Lets the wishlist and skin detail pages cross-reference the loadout
 * builder instead of the three features being blind to each other ("is this
 * one I've already picked?" was previously unanswerable without opening the
 * board). One query for a whole page of cards, not one per card.
 */
export async function getLoadoutMembership(
  userId: string,
  skinIds: string[],
): Promise<Map<string, string[]>> {
  if (skinIds.length === 0) return new Map();

  const items = await prisma.loadoutItem.findMany({
    where: { skinId: { in: skinIds }, loadout: { userId } },
    select: { skinId: true, loadout: { select: { name: true } } },
  });

  const bySkin = new Map<string, string[]>();
  for (const item of items) {
    const names = bySkin.get(item.skinId) ?? [];
    // The same skin can legitimately sit in several loadouts, but only once
    // per loadout (the [loadoutId, weaponId] unique constraint) - so no
    // dedupe is needed beyond grouping.
    names.push(item.loadout.name);
    bySkin.set(item.skinId, names);
  }
  return bySkin;
}
