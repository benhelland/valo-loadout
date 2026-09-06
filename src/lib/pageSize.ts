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
// `page` arrives from the query string and is otherwise unbounded, which costs
// twice. `skip: (page - 1) * pageSize` becomes an enormous OFFSET, and Postgres
// reaches it by walking and discarding every preceding row, so one request can
// be made arbitrarily expensive. It is also part of the cached listing's key,
// so an unbounded page number is an unbounded set of cache entries, each a miss
// that reaches the database.
//
// Far above anything a real reader reaches: the catalog is a few dozen pages at
// the smallest page size. `pageCount` in the response is what the UI paginates
// against.
export const MAX_PAGE = 500;
