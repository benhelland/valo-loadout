import { cache } from "react";
import { prisma } from "@/lib/db";
import { deriveEstimates, type EstimateTable } from "@/lib/pricing";

/**
 * The estimate table, derived from every real price we've observed.
 *
 * Wrapped in React's `cache()` so a page rendering 60 skin cards runs this
 * once per request rather than once per card. It's a single grouped read of
 * a column that changes at most once a day (when a shop check harvests new
 * prices), so per-request freshness is more than enough.
 */
export const getPriceEstimates = cache(async (): Promise<EstimateTable> => {
  const rows = await prisma.skin.findMany({
    where: { priceVp: { not: null }, contentTierId: { not: null } },
    select: {
      priceVp: true,
      contentTier: { select: { devName: true } },
      weapon: { select: { category: true } },
    },
  });

  return deriveEstimates(
    rows.flatMap((row) =>
      row.contentTier && row.priceVp !== null
        ? [{ tierDevName: row.contentTier.devName, isMelee: row.weapon?.category === "Melee", priceVp: row.priceVp }]
        : [],
    ),
  );
});
