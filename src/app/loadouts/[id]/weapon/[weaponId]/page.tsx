import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUserId } from "@/lib/auth";
import { getLoadout, getWeaponName } from "@/queries/loadouts";
import { listSkins, getFilterOptions, resolveSort } from "@/queries/gallery";
import { resolveCatalogId, resolveThemeId, resolveColor, resolveVibe, resolveSearch } from "@/lib/filterParams";
import { FilterBar } from "@/components/gallery/FilterBar";
import { SkinCard } from "@/components/gallery/SkinCard";
import { Pagination } from "@/components/gallery/Pagination";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// The loadout picker: the gallery's own filter/search UI, scoped to one
// weapon slot - "building a loadout feels like an extension of browsing,
// not a separate form" (docs/PRD.md).
export default async function LoadoutWeaponPickerPage({
  params,
  searchParams,
}: PageProps<"/loadouts/[id]/weapon/[weaponId]">) {
  const { id, weaponId } = await params;
  const sp = await searchParams;
  const userId = await getCurrentUserId();

  const [loadout, weapon] = await Promise.all([getLoadout(id, userId), getWeaponName(weaponId)]);
  if (!loadout) notFound();
  if (!weapon) notFound();

  // Resolved before flatParams for the same reason as the gallery page -
  // see the comment there.
  const sort = resolveSort(first(sp.sort));
  const flatParams: Record<string, string | undefined> = {
    // Validated, not trusted - see src/lib/filterParams.ts.
    tierId: resolveCatalogId(first(sp.tierId)),
    themeId: resolveThemeId(first(sp.themeId)),
    color: resolveColor(first(sp.color)),
    vibe: resolveVibe(first(sp.vibe)),
    hasAnimation: first(sp.hasAnimation),
    search: resolveSearch(first(sp.search)),
    sort,
    page: first(sp.page),
  };

  const filters = {
    weaponId,
    tierId: flatParams.tierId,
    themeId: flatParams.themeId,
    color: flatParams.color,
    vibe: flatParams.vibe,
    hasAnimation: flatParams.hasAnimation === "1",
    search: flatParams.search,
    sort,
    page: flatParams.page ? Number(flatParams.page) : 1,
  };

  const [{ skins, total, page, pageCount }, filterOptions] = await Promise.all([listSkins(filters), getFilterOptions()]);

  const basePath = `/loadouts/${id}/weapon/${weaponId}`;

  return (
    <div className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8 py-8">
      <Link href={`/loadouts/${id}`} className="text-xs font-semibold uppercase tracking-widest text-muted hover:text-accent transition-colors">
        ← Back to {loadout.name}
      </Link>

      <div className="mt-4 mb-6 flex items-baseline gap-4 border-l-4 border-accent pl-4">
        <h1 className="font-display text-5xl uppercase tracking-wide leading-none">{weapon.displayName}</h1>
        <p className="text-sm uppercase tracking-wide text-muted">
          {total.toLocaleString()} {total === 1 ? "skin" : "skins"} for this slot
        </p>
      </div>

      <FilterBar
        weapons={[]}
        hideWeaponFilter
        lockedWeaponId={weaponId}
        tiers={filterOptions.tiers}
        themes={filterOptions.themes}
        vibeTags={filterOptions.vibeTags}
        current={flatParams}
        clearHref={basePath}
        resultHrefBase={`${basePath}/skins`}
      />

      {skins.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="font-display text-2xl uppercase tracking-wide text-foreground">No matches</p>
          <p className="max-w-sm text-sm text-muted">
            Nothing in the catalog fits every filter at once. Try removing one.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {skins.map((skin) => (
            <SkinCard key={skin.id} skin={skin} hrefBase={`${basePath}/skins`} matchColor={filters.color} />
          ))}
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} searchParams={flatParams} basePath={basePath} />
    </div>
  );
}
