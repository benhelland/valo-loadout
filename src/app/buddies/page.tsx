import Link from "next/link";
import { listBuddiesPage, getBuddyColorOptions } from "@/queries/buddies";
import { BuddyCard } from "@/components/gallery/BuddyCard";
import { BuddyFilterBar } from "@/components/gallery/BuddyFilterBar";
import { GalleryTabs } from "@/components/gallery/GalleryTabs";
import { Pagination } from "@/components/gallery/Pagination";
import { BUDDY_PAGE_SIZES, DEFAULT_BUDDY_PAGE_SIZE, resolvePageSize } from "@/lib/pageSize";
import { safeReturnTo, withParam } from "@/lib/safeReturnTo";
import { resolveCatalogId, resolveColor, resolveSearch } from "@/lib/filterParams";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BuddiesPage({ searchParams }: PageProps<"/buddies">) {
  const sp = await searchParams;

  // "Pick a buddy" mode: reached from a skin's detail page via a link that
  // carries where to return to (and what's already equipped). Validated
  // rather than trusted - see src/lib/safeReturnTo.ts.
  const returnTo = safeReturnTo(first(sp.returnTo));
  const currentBuddyId = resolveCatalogId(first(sp.currentBuddyId));

  const flatParams: Record<string, string | undefined> = {
    // Validated, not trusted - see src/lib/filterParams.ts.
    search: resolveSearch(first(sp.search)),
    color: resolveColor(first(sp.color)),
    page: first(sp.page),
    pageSize: first(sp.pageSize),
    returnTo: returnTo ?? undefined,
    currentBuddyId,
  };

  const pageSize = resolvePageSize(flatParams.pageSize, BUDDY_PAGE_SIZES, DEFAULT_BUDDY_PAGE_SIZE);

  const [{ buddies, total, page, pageCount }, colorOptions] = await Promise.all([
    listBuddiesPage({
      search: flatParams.search,
      color: flatParams.color,
      page: flatParams.page ? Number(flatParams.page) : 1,
      pageSize,
    }),
    getBuddyColorOptions(),
  ]);

  // Preserve pick-mode context across filter/pagination navigation.
  const baseQuery = new URLSearchParams();
  if (returnTo) baseQuery.set("returnTo", returnTo);
  if (currentBuddyId) baseQuery.set("currentBuddyId", currentBuddyId);
  const clearHref = baseQuery.toString() ? `/buddies?${baseQuery.toString()}` : "/buddies";

  return (
    <div className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8 py-8">
      {returnTo ? (
        <Link
          href={returnTo}
          className="text-xs font-semibold uppercase tracking-widest text-muted hover:text-accent transition-colors"
        >
          ← Back without changing
        </Link>
      ) : (
        <GalleryTabs active="buddies" />
      )}

      <div className={`${returnTo ? "mt-4" : ""} mb-6 flex items-baseline gap-4 border-l-4 border-accent pl-4`}>
        <h1 className="font-display text-5xl uppercase tracking-wide leading-none">
          {returnTo ? "Pick a Buddy" : "Buddies"}
        </h1>
        <p className="text-sm uppercase tracking-wide text-muted">
          {returnTo
            ? `${total.toLocaleString()} to choose from — click one to equip it`
            : `${total.toLocaleString()} gun buddies ever released`}
        </p>
      </div>

      <BuddyFilterBar
        colorOptions={colorOptions}
        current={{ search: flatParams.search, color: flatParams.color }}
        clearHref={clearHref}
      />

      {buddies.length === 0 ? (
        <p className="text-center text-muted py-16">No buddies match those filters.</p>
      ) : (
        <div className="mt-6 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 2xl:grid-cols-10 gap-3">
          {buddies.map((buddy) => (
            <BuddyCard
              key={buddy.id}
              buddy={buddy}
              selectHref={returnTo ? withParam(returnTo, "buddyId", buddy.id) : undefined}
              isSelected={currentBuddyId === buddy.id}
            />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        pageCount={pageCount}
        searchParams={flatParams}
        basePath="/buddies"
        pageSizeOptions={BUDDY_PAGE_SIZES}
        pageSize={pageSize}
      />
    </div>
  );
}
