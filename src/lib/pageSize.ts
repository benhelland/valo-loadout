// Page-size options offered in the gallery pagination dropdowns.
//
// resolvePageSize() only ever returns a value from the allowed list - the
// raw value comes from a URL query param, and echoing that straight into a
// query's `take` would let anyone request the entire table in one request.
// Anything unrecognised silently falls back to the default.

export const SKIN_PAGE_SIZES = [24, 48, 96, 192] as const;
export const BUDDY_PAGE_SIZES = [48, 96, 192, 384] as const;

export const DEFAULT_SKIN_PAGE_SIZE = 48;
// Denser than skins by default - buddy icons are small and low-res, so the
// grid fits far more per row without hurting readability.
export const DEFAULT_BUDDY_PAGE_SIZE = 96;

export function resolvePageSize(
  raw: string | number | undefined,
  allowed: readonly number[],
  fallback: number,
): number {
  const parsed = typeof raw === "string" ? Number(raw) : raw;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) return fallback;
  return allowed.includes(parsed) ? parsed : fallback;
}
