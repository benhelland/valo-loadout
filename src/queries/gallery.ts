import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { VIBE_TAGS } from "@/lib/vibeTagging";
import { fuzzyScore } from "@/lib/fuzzyMatch";
import { DEFAULT_SKIN_PAGE_SIZE } from "@/lib/pageSize";
import { collectionGroupFilter, groupCollections } from "@/lib/collectionGroups";

export const PAGE_SIZE = DEFAULT_SKIN_PAGE_SIZE;

// No "newest". `skins.firstSeenInSyncAt` is this app's own insert timestamp,
// not a release date - valorant-api.com exposes none as of 2026-09-02 - and
// the entire launch catalog landed inside a single 15-second backfill window.
// Ordering by it therefore sorts the catalog by *millisecond of insertion*,
// which is just the order the upstream API returned them in. A sort has to
// order the whole catalog to mean anything, and this column cannot.
//
// The column stays: it's accurate for anything added *after* the backfill, so
// the "what's new" intent is better served later by a "New" badge on skins
// first seen within the last N days. That only has to be right about genuinely
// new skins, needs no curated release-date data, and correctly never matches
// the backfilled catalog. See docs/ARCHITECTURE.md "No release date anywhere".
export type SortOption = "price" | "alphabetical" | "rarity";

export const SORT_OPTIONS: readonly SortOption[] = ["rarity", "price", "alphabetical"];

/**
 * Validates a raw `?sort=` value against the allowlist, the same treatment
 * `pageSize` gets (src/lib/pageSize.ts). Casting the raw value with
 * `as SortOption` instead would tell the type system a lie about
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
// A select, not an include: `include` returns every column of every relation,
// which cost ~3.3 KB per card. These are exactly the fields SkinCard and the
// price helpers read - notably not `theme`, which no card renders at all.
//
// Kept as one shared shape so the wishlist and shop grids, which feed the
// same card, cannot drift into a near-duplicate that quietly pulls more.
export const listSelect = {
  id: true,
  displayName: true,
  displayIconUrl: true,
  priceVp: true,
  weapon: { select: { displayName: true, category: true } },
  contentTier: { select: { devName: true, displayName: true, displayIconUrl: true, highlightColor: true, rank: true } },
  // Bounded to 1: a fallback image source for the 47 skins whose own
  // displayIconUrl is null.
  levels: { orderBy: { levelIndex: "desc" as const }, take: 1, select: { displayIconUrl: true } },
  // Every chroma's colour, so a colour-filtered card can show the recolor
  // that actually matched - but only the four fields that requires.
  chromas: {
    orderBy: { chromaIndex: "asc" as const },
    select: { id: true, colorFamily: true, displayIconUrl: true, fullRenderUrl: true },
  },
} satisfies Prisma.SkinSelect;

export type ListedSkin = Prisma.SkinGetPayload<{ select: typeof listSelect }>;

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
  if (filters.themeId) {
    // A grouped collection (VCT, Champions) is a synthetic id standing in
    // for many real theme rows - see src/lib/collectionGroups.ts.
    const group = collectionGroupFilter(filters.themeId);
    if (group) where.theme = group.theme;
    else where.themeId = filters.themeId;
  }

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
// Structurally typed to only what it reads, so the fuzzy path can rank a
// lightweight projection (id/name/tier rank) without loading full relations.
type SortableSkin = { displayName: string; contentTier: { rank: number } | null };

function compareBySort(a: SortableSkin, b: SortableSkin, sort: SortOption | undefined): number {
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

    // Two phases, because ranking needs every candidate but rendering needs
    // only one page of them. Phase one selects just the three columns
    // scoring and tie-breaking actually read - no relations, so none of the
    // levels/chromas rows (several thousand across the catalog) are touched.
    const candidates = await prisma.skin.findMany({
      where,
      select: { id: true, displayName: true, contentTier: { select: { rank: true } } },
    });

    const ranked = candidates
      .map((skin) => ({ skin, score: fuzzyScore(trimmedSearch, skin.displayName) }))
      .filter((x): x is { skin: (typeof candidates)[number]; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score || compareBySort(a.skin, b.skin, filters.sort));

    const total = ranked.length;
    const pageIds = ranked.slice((page - 1) * pageSize, page * pageSize).map((r) => r.skin.id);

    // Phase two hydrates only the page being shown. `in` returns them in
    // arbitrary order, so re-apply the ranked order rather than trusting it.
    // payload-ok: bounded by pageIds, which is one page window at most.
    const hydrated = await prisma.skin.findMany({ where: { id: { in: pageIds } }, select: listSelect });
    const byId = new Map(hydrated.map((s) => [s.id, s]));
    const skins = pageIds.map((id) => byId.get(id)).filter((s): s is ListedSkin => s !== undefined);

    return { skins, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
  }

  // Normal path: no search text, so SQL does filtering, sorting, and
  // pagination directly - the efficient case, and the common one.
  return readSkinPage(filters, page, pageSize);
}

/**
 * The non-search listing, cached.
 *
 * Deliberately not applied to the search path above: its cache key would
 * include the user's arbitrary search text, so the key space is unbounded and
 * every novel query would add an entry that is unlikely ever to be read again.
 * The non-search path has a small, bounded key space - the filter controls
 * offer fixed values - and it is the path a crawler takes, since robots.txt
 * disallows query strings and so only ever fetches the bare gallery.
 */
const readSkinPage = unstable_cache(
  async (filters: GalleryFilters, page: number, pageSize: number) => {
    const where = buildWhere(filters);
    const orderBy = buildOrderBy(filters.sort);

    const [skins, total] = await Promise.all([
      prisma.skin.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: listSelect,
      }),
      prisma.skin.count({ where }),
    ]);

    return { skins, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
  },
  ["skin-page"],
  { revalidate: 3600 },
);

// The columns the detail view actually reads. `include` would pull every
// column of the skin and of all six relations - levels and chromas are the
// expensive ones, since a skin can have several of each.
const detailSelect = {
  id: true,
  displayName: true,
  displayIconUrl: true,
  priceVp: true,
  weaponId: true,
  colorFamily: true,
  weapon: { select: { id: true, displayName: true, category: true, displayIconUrl: true } },
  contentTier: {
    select: { id: true, displayName: true, devName: true, displayIconUrl: true, rank: true, highlightColor: true },
  },
  theme: { select: { id: true, displayName: true, displayIconUrl: true } },
  levels: {
    orderBy: { levelIndex: "asc" as const },
    select: { id: true, levelIndex: true, displayIconUrl: true, videoUrl: true, levelItem: true },
  },
  chromas: {
    orderBy: { chromaIndex: "asc" as const },
    select: {
      id: true,
      chromaIndex: true,
      displayName: true,
      displayIconUrl: true,
      fullRenderUrl: true,
      swatchUrl: true,
      colorFamily: true,
      videoUrl: true,
    },
  },
  vibeTags: { select: { tag: true } },
} satisfies Prisma.SkinSelect;

// Cached because this is the single most-requested query in the app: there is
// one of these pages per skin, every one is in the sitemap, and the answer is
// identical for every visitor. Uncached, a crawler walking the catalog turns
// into one database round-trip per page, which is what actually costs money -
// the hosting request counters cannot bill, the database's compute meter can.
//
// The window is long because the catalog only changes when the sync job runs.
const readSkinDetail = unstable_cache(
  async (id: string) => prisma.skin.findUnique({ where: { id }, select: detailSelect }),
  ["skin-detail"],
  { revalidate: 3600 },
);

/**
 * The detail-page projection. Exported so the views consume the shape the
 * query actually returns, rather than each declaring their own payload type
 * against the full model - which silently requires every column and makes
 * narrowing the query a type error somewhere else. Same contract as
 * `ListedSkin` for the gallery card.
 */
export type SkinDetail = Prisma.SkinGetPayload<{ select: typeof detailSelect }>;

export async function getSkinDetail(id: string) {
  return readSkinDetail(id);
}

// Cached across requests: identical for every visitor, and only changes when
// the sync job adds a weapon, tier or theme - i.e. at Riot's release cadence,
// not per request. Everything returned here is plain arrays of strings, so it
// survives serialization intact (unlike an EstimateTable - see
// src/queries/prices.ts for why that one caches its rows instead).
//
// The tradeoff is accepted, not free: a newly synced collection can take up
// to an hour to appear in the dropdown. That is the right trade for a catalog
// that changes a few times a year.
export const getFilterOptions = unstable_cache(
  async () => {
    // Selected down to what the controls render. These feed a weapon rail and
    // three <select>s; pulling every column cost ~41 KB per gallery view, most
    // of it theme rows nobody displays beyond the name.
    const [weapons, tiers, themes] = await Promise.all([
      prisma.weapon.findMany({
        orderBy: { displayName: "asc" },
        select: { id: true, displayName: true, displayIconUrl: true, category: true },
      }),
      prisma.contentTier.findMany({
        orderBy: { rank: "asc" },
        select: { id: true, displayName: true },
      }),
      prisma.theme.findMany({
        where: { skins: { some: {} } },
        orderBy: { displayName: "asc" },
        select: { id: true, displayName: true },
      }),
    ]);

    // Esports families (VCT capsules, Champions) each collapse into a single
    // option here - the raw list is a third VCT by row count alone. See
    // src/lib/collectionGroups.ts.
    return { weapons, tiers, themes: groupCollections(themes), vibeTags: VIBE_TAGS };
  },
  ["gallery-filter-options"],
  { revalidate: 3600 },
);

/**
 * One buddy, for pages that only ever display the currently-selected one.
 *
 * Replaces a `findMany()` over the whole table. Rendering all 884 buddies as
 * <option> elements cost ~186 KB out of the database and ~260 KB of HTML on
 * every skin page view - roughly 40x the skin being viewed - to duplicate the
 * /buddies picker, which is better in every way. Choosing a buddy is a
 * navigation now, so a page only ever needs the id already in its own URL.
 */
export async function getBuddy(id: string | null | undefined) {
  if (!id) return null;
  return prisma.buddy.findUnique({
    where: { id },
    select: { id: true, displayName: true, displayIconUrl: true },
  });
}
