import { prisma } from "@/lib/db";
import { totalSkinPrice, type PriceTotal } from "@/lib/pricing";
import { getPriceEstimates } from "@/queries/prices";
import { listSelect, type ListedSkin } from "@/queries/gallery";

// Newest-added first - matches the intuition of "what did I just add".
export async function listWishlistSkins(userId: string): Promise<{ skins: ListedSkin[]; priceTotal: PriceTotal }> {
  // payload-ok: one user's own wishlist, rendered in full on their page.
  // Unbounded in principle - revisit with pagination if anyone ever
  // wishlists a meaningful fraction of the catalog.
  const items = await prisma.wishlistItem.findMany({
    where: { userId },
    orderBy: { addedAt: "desc" },
    // `select`, not `include`. listSelect is a Prisma *select* object, and
    // Prisma rejects it in an include position at runtime because include
    // takes only relation fields ("Invalid scalar field `id` for include
    // statement"). TypeScript cannot catch this: excess property checking
    // fires only on fresh object literals, so passing a select-shaped
    // variable to include type-checks and fails on the first real query.
    include: { skin: { select: listSelect } },
  });

  const skins = items.map((item) => item.skin);
  // listSelect already pulls `weapon`, which resolveSkinPrice needs to know
  // a melee skin has no reliable estimate (src/lib/pricing.ts).
  return { skins, priceTotal: totalSkinPrice(skins, await getPriceEstimates()) };
}

// Powers the heart toggle on gallery cards - one query per page render
// rather than one per card. Empty input short-circuits without hitting the
// DB (the loadout picker's own use of SkinCard never wants this at all).
export async function getWishlistedSkinIds(userId: string, skinIds: string[]): Promise<Set<string>> {
  if (skinIds.length === 0) return new Set();
  const items = await prisma.wishlistItem.findMany({
    where: { userId, skinId: { in: skinIds } },
    select: { skinId: true },
  });
  return new Set(items.map((item) => item.skinId));
}

export async function isSkinWishlisted(userId: string, skinId: string): Promise<boolean> {
  // Existence check only, so one column is all that needs to come back.
  const item = await prisma.wishlistItem.findUnique({
    where: { userId_skinId: { userId, skinId } },
    select: { userId: true },
  });
  return item !== null;
}
