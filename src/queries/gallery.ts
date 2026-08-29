import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { VIBE_TAGS } from "@/lib/vibeTagging";

export const PAGE_SIZE = 48;

export type SortOption = "newest" | "price" | "alphabetical" | "rarity";

export interface GalleryFilters {
  weaponId?: string;
  tierId?: string;
  themeId?: string;
  color?: string;
  vibe?: string;
  hasAnimation?: boolean;
  search?: string;
  sort?: SortOption;
  page?: number;
}

function buildWhere(filters: GalleryFilters): Prisma.SkinWhereInput {
  // Exclude the catalog's ~40 non-skin entries: the stock "Standard X"
  // reskin and "Random Favorite Skin" placeholder that valorant-api.com
  // includes per weapon. Both are real rows with no content tier (verified:
  // every contentTierId-null skin is one of these two, no false positives),
  // so that's a reliable signal to filter the gallery on. They stay in the
  // DB and reachable by direct /skins/[id] link - the future loadout builder
  // needs "no skin"/"random" to be a valid per-weapon choice - just hidden
  // from this browse listing since they're not real skins to look at.
  const where: Prisma.SkinWhereInput = { contentTierId: { not: null } };

  if (filters.weaponId) where.weaponId = filters.weaponId;
  if (filters.tierId) where.contentTierId = filters.tierId;
  if (filters.themeId) where.themeId = filters.themeId;

  if (filters.color) {
    where.OR = [{ colorFamily: filters.color }, { chromas: { some: { colorFamily: filters.color } } }];
  }

  if (filters.vibe) {
    where.vibeTags = { some: { tag: filters.vibe } };
  }

  if (filters.hasAnimation) {
    where.AND = [
      { OR: [{ levels: { some: { videoUrl: { not: null } } } }, { chromas: { some: { videoUrl: { not: null } } } }] },
    ];
  }

  if (filters.search) {
    where.displayName = { contains: filters.search, mode: "insensitive" };
  }

  return where;
}

function buildOrderBy(sort: SortOption | undefined): Prisma.SkinOrderByWithRelationInput[] {
  switch (sort) {
    case "alphabetical":
      return [{ displayName: "asc" }];
    // Price is a deterministic function of tier in our estimate model (see
    // src/lib/pricing.ts), so "price" and "rarity" both sort by tier rank -
    // just in opposite directions (cheapest-first vs. rarest-first).
    case "price":
      return [{ contentTier: { rank: "asc" } }, { displayName: "asc" }];
    case "rarity":
      return [{ contentTier: { rank: "desc" } }, { displayName: "asc" }];
    case "newest":
    default:
      return [{ firstSeenInSyncAt: "desc" }];
  }
}

export async function listSkins(filters: GalleryFilters) {
  const where = buildWhere(filters);
  const orderBy = buildOrderBy(filters.sort);
  const page = Math.max(1, filters.page ?? 1);

  const [skins, total] = await Promise.all([
    prisma.skin.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { weapon: true, contentTier: true, theme: true },
    }),
    prisma.skin.count({ where }),
  ]);

  return { skins, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getSkinDetail(id: string) {
  return prisma.skin.findUnique({
    where: { id },
    include: {
      weapon: true,
      contentTier: true,
      theme: true,
      levels: { orderBy: { levelIndex: "asc" } },
      chromas: true,
      vibeTags: true,
    },
  });
}

export async function getFilterOptions() {
  const [weapons, tiers, themes] = await Promise.all([
    prisma.weapon.findMany({ orderBy: { displayName: "asc" } }),
    prisma.contentTier.findMany({ orderBy: { rank: "asc" } }),
    prisma.theme.findMany({
      where: { skins: { some: {} } },
      orderBy: { displayName: "asc" },
    }),
  ]);

  return { weapons, tiers, themes, vibeTags: VIBE_TAGS };
}

export async function listBuddies() {
  return prisma.buddy.findMany({ orderBy: { displayName: "asc" } });
}
