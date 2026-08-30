import { listSkins, getFilterOptions, type SortOption } from "@/queries/gallery";
import { SkinCard } from "@/components/gallery/SkinCard";
import { FilterBar } from "@/components/gallery/FilterBar";
import { GalleryTabs } from "@/components/gallery/GalleryTabs";
import { Pagination } from "@/components/gallery/Pagination";
import { SKIN_PAGE_SIZES, DEFAULT_SKIN_PAGE_SIZE, resolvePageSize } from "@/lib/pageSize";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function GalleryPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const flatParams: Record<string, string | undefined> = {
    weaponId: first(sp.weaponId),
    tierId: first(sp.tierId),
    themeId: first(sp.themeId),
    color: first(sp.color),
    vibe: first(sp.vibe),
    hasAnimation: first(sp.hasAnimation),
    search: first(sp.search),
    sort: first(sp.sort),
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
    sort: flatParams.sort as SortOption | undefined,
    page: flatParams.page ? Number(flatParams.page) : 1,
    pageSize,
  };

  const [{ skins, total, page, pageCount }, filterOptions] = await Promise.all([
    listSkins(filters),
    getFilterOptions(),
  ]);

  return (
    <div className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8 py-8">
      <GalleryTabs active="skins" />

      <div className="mb-6 flex items-baseline gap-4 border-l-4 border-accent pl-4">
        <h1 className="font-display text-5xl uppercase tracking-wide leading-none">All Skins</h1>
        <p className="text-sm uppercase tracking-wide text-muted">
          {total.toLocaleString()} skins across every weapon and knife
        </p>
      </div>

      <FilterBar
        weapons={filterOptions.weapons}
        tiers={filterOptions.tiers}
        themes={filterOptions.themes}
        vibeTags={filterOptions.vibeTags}
        current={flatParams}
      />

      {skins.length === 0 ? (
        <p className="text-center text-muted py-16">No skins match those filters.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {skins.map((skin) => (
            <SkinCard key={skin.id} skin={skin} matchColor={filters.color} />
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
