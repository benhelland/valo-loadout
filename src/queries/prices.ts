import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { deriveEstimates, type EstimateTable } from "@/lib/pricing";

// Cached across requests, not just within one. Every visitor derives the same
// table from the same rows, and those rows only change when a shop check
// harvests a new price - at most once a day per linked account.
//
// The cache boundary is deliberately around the ROWS, not around
// deriveEstimates(). EstimateTable is a ReadonlyMap, and unstable_cache
// serializes what it stores: a Map round-trips to `{}`, which would leave
// every lookup empty and silently turn every estimated price into "Unknown".
// Caching the plain array and rebuilding the Map afterwards avoids that
// entirely rather than relying on nobody noticing.
const readPriceRows = unstable_cache(
  async () =>
    prisma.skin.findMany({
      where: { priceVp: { not: null }, contentTierId: { not: null } },
      select: {
        priceVp: true,
        themeId: true,
        contentTier: { select: { devName: true } },
        weapon: { select: { category: true } },
      },
    }),
  ["price-observations"],
  { revalidate: 3600 },
);

/**
 * The estimate table, derived from every real price we've observed.
 *
 * Wrapped in React's `cache()` so a page rendering 60 skin cards runs this
 * once per request rather than once per card. It's a single grouped read of
 * a column that changes at most once a day (when a shop check harvests new
 * prices), so per-request freshness is more than enough.
 */
export const getPriceEstimates = cache(async (): Promise<EstimateTable> => {
  const rows = await readPriceRows();

  return deriveEstimates(
    rows.flatMap((row) =>
      row.contentTier && row.priceVp !== null
        ? [
            {
              tierDevName: row.contentTier.devName,
              isMelee: row.weapon?.category === "Melee",
              priceVp: row.priceVp,
              themeId: row.themeId,
            },
          ]
        : [],
    ),
  );
});
