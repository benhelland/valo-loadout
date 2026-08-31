import { prisma } from "@/lib/db";
import { estimatePriceVp } from "@/lib/pricing";
import { listInclude, type ListedSkin } from "@/queries/gallery";

// Newest-added first - matches the intuition of "what did I just add".
export async function listWishlistSkins(userId: string): Promise<{ skins: ListedSkin[]; totalVp: number }> {
  const items = await prisma.wishlistItem.findMany({
    where: { userId },
    orderBy: { addedAt: "desc" },
    include: { skin: { include: listInclude } },
  });

  const skins = items.map((item) => item.skin);
  const totalVp = skins.reduce((sum, skin) => sum + (estimatePriceVp(skin.contentTier?.devName) ?? 0), 0);
  return { skins, totalVp };
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
  const item = await prisma.wishlistItem.findUnique({ where: { userId_skinId: { userId, skinId } } });
  return item !== null;
}
