// Page-size options offered in the gallery pagination dropdowns.
//
// resolvePageSize() only ever returns a value from the allowed list - the
// raw value comes from a URL query param, and echoing that straight into a
// query's `take` would let anyone request the entire table in one request.
// Anything unrecognised silently falls back to the default.

export const SKIN_PAGE_SIZES = [25, 50, 100, 200] as const;
export const BUDDY_PAGE_SIZES = [50, 100, 200, 400] as const;

export const DEFAULT_SKIN_PAGE_SIZE = 25;
// Denser than skins by default - buddy icons are small and low-res, so the
// grid fits far more per row without hurting readability.
export const DEFAULT_BUDDY_PAGE_SIZE = 100;

export function resolvePageSize(
  raw: string | number | undefined,
  allowed: readonly number[],
  fallback: number,
): number {
  const parsed = typeof raw === "string" ? Number(raw) : raw;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) return fallback;
  return allowed.includes(parsed) ? parsed : fallback;
}

// Upper bound on the page number any listing will honour.
//
// The reason is the cache key, not the scan. `page` is part of the cached
// listing's key, so an unbounded page number is an unbounded set of cache
// entries - each one a miss that reaches the database, and each one competing
// for space with the entries that are actually hot. (The SQL `OFFSET` itself
// is not the problem: Postgres cannot skip past more rows than the query
// matches, so a huge offset over a catalog of a few thousand rows costs about
// what a small one does.)
//
// Far above anything a real reader reaches: the catalog is a few dozen pages
// at the smallest page size. `pageCount` in the response is what the UI
// paginates against.
export const MAX_PAGE = 500;

/**
 * Turns a raw `?page=` value into a page number that is safe to use.
 *
 * Every other query param goes through a resolver in src/lib/filterParams.ts;
 * this one did not, and `Number("abc")` is `NaN`, which survives `Math.max`
 * and `Math.min` and reaches Prisma as `skip: NaN` - a validation error, so an
 * unauthenticated request could turn a junk query string into a 500. A
 * fractional value gives a fractional `skip` with the same result.
 */
export function resolvePage(raw: string | number | undefined | null): number {
  const parsed = typeof raw === "string" ? Number(raw) : raw;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) return 1;
  return Math.min(MAX_PAGE, Math.max(1, Math.floor(parsed)));
}
