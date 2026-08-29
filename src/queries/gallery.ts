import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { VIBE_TAGS } from "@/lib/vibeTagging";
import { fuzzyScore } from "@/lib/fuzzyMatch";
import { DEFAULT_SKIN_PAGE_SIZE } from "@/lib/pageSize";

export const PAGE_SIZE = DEFAULT_SKIN_PAGE_SIZE;

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
  // Callers must pass an already-validated value (see resolvePageSize in
  // src/lib/pageSize.ts) - this is never used to sanitise raw input.
  pageSize?: number;
}

// Bounded to 1 row each - a cheap fallback source for SkinCard's image when
// the skin's own top-level displayIconUrl is null (confirmed: 47 real
// skins). Preference is the highest level's icon (levelIndex desc) of the
// base chroma (chromaIndex 0), since that's the base/default look at its
// most complete. Shared between both listSkins code paths below.
const listInclude = {
  weapon: true,
  contentTier: true,
  theme: true,
  levels: { orderBy: { levelIndex: "desc" as const }, take: 1 },
  chromas: { orderBy: { chromaIndex: "asc" as const }, take: 1 },
} satisfies Prisma.SkinInclude;

type ListedSkin = Prisma.SkinGetPayload<{ include: typeof listInclude }>;

// Everything except the text search - that's handled separately (SQL
// `contains` when there's no search text driving the normal indexed/
// paginated path; fuzzy-ranked in JS, see listSkins, when there is).
function buildWhere(filters: Omit<GalleryFilters, "search">): Prisma.SkinWhereInput {
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

  return where;
}

// JS equivalent of buildOrderBy, for the fuzzy-search path below where
// ranking already has to happen in application code - used only as a
// tiebreaker under fuzzy-match score, never on its own while searching.
function compareBySort(a: ListedSkin, b: ListedSkin, sort: SortOption | undefined): number {
  switch (sort) {
    case "alphabetical":
      return a.displayName.localeCompare(b.displayName);
    case "price":
      return (a.contentTier?.rank ?? 0) - (b.contentTier?.rank ?? 0) || a.displayName.localeCompare(b.displayName);
    case "newest":
      return b.firstSeenInSyncAt.getTime() - a.firstSeenInSyncAt.getTime();
    case "rarity":
    default:
      return (b.contentTier?.rank ?? 0) - (a.contentTier?.rank ?? 0) || a.displayName.localeCompare(b.displayName);
  }
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
    case "newest":
      return [{ firstSeenInSyncAt: "desc" }];
    case "rarity":
    default:
      // Default, not "newest": firstSeenInSyncAt is only meaningful for
      // skins added after this project started syncing (documented gap in
      // ARCHITECTURE.md) - almost the entire current catalog shares one
      // backfill timestamp, so "newest" isn't actually a meaningful default
      // order yet. Rarity-first also just makes a better first impression
      // for a gallery whose whole point is showing skins off.
      return [{ contentTier: { rank: "desc" } }, { displayName: "asc" }];
  }
}

export async function listSkins(filters: GalleryFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? PAGE_SIZE;
  const trimmedSearch = filters.search?.trim();

  if (trimmedSearch && trimmedSearch.length >= 2) {
    // Fuzzy search path: relevance ranking has to happen in JS (no fuzzy
    // matching in SQL), so pagination/counting move here too, on the
    // already-ranked array rather than the DB. SQL still applies every
    // *other* filter (weapon/tier/theme/color/vibe/animation) - only the
    // text match and the resulting order are handled here. The catalog is
    // small enough (~1365 real skins, usually far fewer once other filters
    // narrow it down) that fetching the full matching set and ranking in
    // memory is simple and still fast - the same approach the search bar's
    // predictive dropdown already uses (src/actions/search.ts).
    const where = buildWhere(filters);
    const candidates = await prisma.skin.findMany({ where, include: listInclude });

    const ranked = candidates
      .map((skin) => ({ skin, score: fuzzyScore(trimmedSearch, skin.displayName) }))
      .filter((x): x is { skin: ListedSkin; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score || compareBySort(a.skin, b.skin, filters.sort));

    const total = ranked.length;
    const skins = ranked.slice((page - 1) * pageSize, page * pageSize).map((r) => r.skin);
    return { skins, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
  }

  // Normal path: no search text, so SQL does filtering, sorting, and
  // pagination directly - the efficient case, and the common one.
  const where = buildWhere(filters);
  const orderBy = buildOrderBy(filters.sort);

  const [skins, total] = await Promise.all([
    prisma.skin.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: listInclude,
    }),
    prisma.skin.count({ where }),
  ]);

  return { skins, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getSkinDetail(id: string) {
  return prisma.skin.findUnique({
    where: { id },
    include: {
      weapon: true,
      contentTier: true,
      theme: true,
      levels: { orderBy: { levelIndex: "asc" } },
      chromas: { orderBy: { chromaIndex: "asc" } },
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
