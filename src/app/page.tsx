import { listSkins, getFilterOptions, resolveSort } from "@/queries/gallery";
import { getWishlistedSkinIds } from "@/queries/wishlist";
import { getOptionalUserId } from "@/lib/auth";
import { SkinCard } from "@/components/gallery/SkinCard";
import { FilterBar } from "@/components/gallery/FilterBar";
import { WeaponRail } from "@/components/gallery/WeaponRail";
import { GalleryTabs } from "@/components/gallery/GalleryTabs";
import { Pagination } from "@/components/gallery/Pagination";
import { SKIN_PAGE_SIZES, DEFAULT_SKIN_PAGE_SIZE, resolvePageSize } from "@/lib/pageSize";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function GalleryPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  // Resolved once, before flatParams, because flatParams is deliberately
  // typed as loose strings (it feeds FilterBar and Pagination, which just
  // rebuild query strings) and would widen SortOption straight back to
  // string. Normalising here means an unrecognised value - e.g. the removed
  // "newest", still live in old bookmarks - never reaches the sort <select>
  // as a phantom selection, and isn't carried into pagination links either.
  const sort = resolveSort(first(sp.sort));
  const flatParams: Record<string, string | undefined> = {
    weaponId: first(sp.weaponId),
    tierId: first(sp.tierId),
    themeId: first(sp.themeId),
    color: first(sp.color),
    vibe: first(sp.vibe),
    hasAnimation: first(sp.hasAnimation),
    search: first(sp.search),
    sort,
    page: first(sp.page),
    pageSize: first(sp.pageSize),
  };

  const pageSize = resolvePageSize(flatParams.pageSize, SKIN_PAGE_SIZES, DEFAULT_SKIN_PAGE_SIZE);

  const filters = {
    weaponId: flatParams.weaponId,
    tierId: flatParams.tierId,
    themeId: flatParams.themeId,
    color: flatParams.color,
    vibe: flatParams.vibe,
    hasAnimation: flatParams.hasAnimation === "1",
    search: flatParams.search,
    sort,
    page: flatParams.page ? Number(flatParams.page) : 1,
    pageSize,
  };

  const [{ skins, total, page, pageCount }, filterOptions, userId] = await Promise.all([
    listSkins(filters),
    getFilterOptions(),
    getOptionalUserId(),
  ]);
  const wishlistedIds = userId ? await getWishlistedSkinIds(userId, skins.map((s) => s.id)) : new Set<string>();

  // Sort is excluded - it always has a value, so it never means "filtered".
  const hasActiveFilter = Boolean(
    filters.weaponId || filters.tierId || filters.themeId || filters.color || filters.vibe || filters.hasAnimation || filters.search,
  );

  return (
    <div className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8 py-8">
      <GalleryTabs active="skins" />

      <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-l-4 border-accent pl-4">
        <h1 className="font-display text-5xl uppercase tracking-wide leading-none">All Skins</h1>
        {/* The "every weapon and knife" boast only holds for the unfiltered
            view - with a weapon or tier selected it's just wrong. */}
        <p className="text-sm uppercase tracking-wide text-muted">
          {hasActiveFilter
            ? `${total.toLocaleString()} ${total === 1 ? "match" : "matches"}`
            : `${total.toLocaleString()} skins across every weapon and knife`}
        </p>
      </div>

      {/* Weapon is promoted out of the dropdown row into its own always-
          visible rail - see WeaponRail for the reasoning. FilterBar's own
          weapon <select> is hidden here to avoid two controls fighting over
          the same query param. */}
      <WeaponRail weapons={filterOptions.weapons} currentWeaponId={filters.weaponId} />

      <FilterBar
        weapons={filterOptions.weapons}
        tiers={filterOptions.tiers}
        themes={filterOptions.themes}
        vibeTags={filterOptions.vibeTags}
        current={flatParams}
        hideWeaponFilter
        lockedWeaponId={filters.weaponId}
      />

      {skins.length === 0 ? (
        <p className="text-center text-muted py-16">No skins match those filters.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {skins.map((skin) => (
            <SkinCard
              key={skin.id}
              skin={skin}
              matchColor={filters.color}
              wishlist={{ isWishlisted: wishlistedIds.has(skin.id), isSignedIn: !!userId }}
            />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        pageCount={pageCount}
        searchParams={flatParams}
        pageSizeOptions={SKIN_PAGE_SIZES}
        pageSize={pageSize}
      />
    </div>
  );
}
