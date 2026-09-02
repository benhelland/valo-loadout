import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { VIBE_TAGS } from "@/lib/vibeTagging";
import { fuzzyScore } from "@/lib/fuzzyMatch";
import { DEFAULT_SKIN_PAGE_SIZE } from "@/lib/pageSize";

export const PAGE_SIZE = DEFAULT_SKIN_PAGE_SIZE;

// No "newest". `skins.firstSeenInSyncAt` is our own insert timestamp, not a
// release date (valorant-api.com has none - re-confirmed 2026-09-02), and the
// entire launch catalog was backfilled inside a single 15-second sync run on
// 2026-08-28. Sorting by it therefore ordered 1,365 skins by *millisecond of
// insertion*, i.e. the order the upstream API happened to return them - which
// surfaced a clump of melee skins at the top and read as authoritative. A
// sort has to order the whole catalog to be meaningful, and this one couldn't.
//
// The column stays: it's accurate for anything added *after* the backfill, so
// the "what's new" intent is better served later by a "New" badge on skins
// first seen within the last N days. That only has to be right about genuinely
// new skins, needs no curated release-date data, and correctly never matches
// the backfilled catalog. See docs/ARCHITECTURE.md "No release date anywhere".
export type SortOption = "price" | "alphabetical" | "rarity";

export const SORT_OPTIONS: readonly SortOption[] = ["rarity", "price", "alphabetical"];

/**
 * Validates a raw `?sort=` value against the allowlist, same treatment
 * `pageSize` already gets (src/lib/pageSize.ts) - callers previously cast it
 * with `as SortOption`, which told the type system a lie about
 * attacker-controllable input. Returns undefined for anything unrecognised
 * (including the removed "newest"), so the caller can drop it from the URL
 * rather than carrying a dead param around forever.
 */
export function resolveSort(raw: string | undefined): SortOption | undefined {
  return SORT_OPTIONS.includes(raw as SortOption) ? (raw as SortOption) : undefined;
}

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

// levels: bounded to 1 row - a cheap fallback source for SkinCard's image
// when the skin's own top-level displayIconUrl is null (confirmed: 47 real
// skins). Preference is the highest level's icon (levelIndex desc).
//
// chromas: the full (small, bounded - typically 1-6 rows) list, not just the
// base one. SkinCard needs every chroma's colorFamily to pick which recolor
// to actually display when a color filter is active and the base chroma
// isn't the one that matched it - see SkinCard's matchColor prop.
// Exported so other query modules (e.g. src/queries/wishlist.ts) that also
// feed SkinCard can reuse the exact same shape instead of a near-duplicate
// that could silently drift from what SkinCard actually expects.
export const listInclude = {
  weapon: true,
  contentTier: true,
  theme: true,
  levels: { orderBy: { levelIndex: "desc" as const }, take: 1 },
  chromas: { orderBy: { chromaIndex: "asc" as const } },
} satisfies Prisma.SkinInclude;

export type ListedSkin = Prisma.SkinGetPayload<{ include: typeof listInclude }>;

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
    case "rarity":
    default:
      // Also the fallback for an unrecognised ?sort= value, including the
      // removed "newest" - old bookmarks and shared links degrade to the
      // default rather than erroring. Rarity-first makes a better first
      // impression anyway for a gallery whose whole point is showing skins off.
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
