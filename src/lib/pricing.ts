// Skin pricing. Two sources, in strict preference order:
//
//   1. `skins.priceVp` - a REAL price Riot quoted, harvested from storefront
//      responses we already fetch (see src/store-check/recordObservedPrices).
//   2. A tier-based estimate, but only for the combinations where a fixed
//      price point actually exists.
//
// valorant-api.com exposes no price data at all, and Riot has withdrawn the
// full-catalogue price endpoint (`GET /store/v1/offers/`, 404 at every
// version as of 2026-09-02 while `/store/v1/wallet` still works), so there is
// no way to bulk-load real prices. Coverage therefore accrues as the store
// rotates.
//
// The previous model was a single tier -> price table, which measurement
// against live Riot data showed could not be right:
//
//   Prism Spectre        SMG      Deluxe     real 1275   est 1275  ok
//   Elderflame Operator  Sniper   Ultra      real 2475   est 2475  ok
//   RGX 11z Pro Vandal   Rifle    Exclusive  real 2175   est 2895  WRONG
//   Aeris Vandal         Rifle    Exclusive  real 2375   est 2895  WRONG
//   Suit of Aeris        Melee    Exclusive  real 5350   est 2895  WRONG
//
// Two structural problems, not tuning problems:
//
//   * "Exclusive" is not a price point. It's the tier Riot uses for one-off
//     and bundle-special skins, and the observations above disagree with each
//     other (2175 vs 2375). No constant can be correct for it.
//   * Melee is priced on a different scale entirely, and not by a fixed
//     multiplier either - 5350 against 2375 for the same bundle's guns is
//     2.25x, so the widely-repeated "knives are 2x" rule doesn't hold.
//
// So estimates are now deliberately narrow: the four standard tiers, guns
// only. Everything else returns null and renders as "—" until a real price is
// observed. Showing nothing is strictly better than showing a number that is
// confidently wrong by thousands of VP.

const STANDARD_TIER_PRICE_VP: Record<string, number> = {
  Select: 875,
  Deluxe: 1275,
  Premium: 1775,
  Ultra: 2475,
  // Deliberately no Exclusive - see above.
};

export type PriceSource = "actual" | "estimate";

export interface SkinPrice {
  vp: number;
  source: PriceSource;
}

export interface PriceableSkin {
  priceVp?: number | null;
  contentTier?: { devName: string } | null;
  weapon?: { category: string | null } | null;
}

/**
 * The price to show for a skin, or null when we genuinely don't know.
 * Callers must render `source === "estimate"` differently - see the "est."
 * marker in SkinCard/SkinDetailView.
 */
export function resolveSkinPrice(skin: PriceableSkin): SkinPrice | null {
  if (typeof skin.priceVp === "number") return { vp: skin.priceVp, source: "actual" };

  // Melee is excluded even on standard tiers: we have no verified melee price
  // point at any tier, and guessing one is exactly the failure being fixed.
  if (skin.weapon?.category === "Melee") return null;

  const tier = skin.contentTier?.devName;
  if (!tier) return null;
  const estimate = STANDARD_TIER_PRICE_VP[tier];
  return estimate === undefined ? null : { vp: estimate, source: "estimate" };
}

export interface PriceTotal {
  vp: number;
  /** How many items contributed a real Riot price. */
  actualCount: number;
  /** How many contributed an estimate. */
  estimateCount: number;
  /** How many had no price at all and are missing from `vp` entirely. */
  unknownCount: number;
}

/**
 * Sums a collection, keeping track of what the total is actually made of.
 * A bare number would imply a precision we don't have - the UI needs to be
 * able to say "plus N with no known price" rather than silently treating
 * unknowns as zero.
 */
export function totalSkinPrice(skins: PriceableSkin[]): PriceTotal {
  let vp = 0;
  let actualCount = 0;
  let estimateCount = 0;
  let unknownCount = 0;

  for (const skin of skins) {
    const price = resolveSkinPrice(skin);
    if (!price) {
      unknownCount++;
      continue;
    }
    vp += price.vp;
    if (price.source === "actual") actualCount++;
    else estimateCount++;
  }

  return { vp, actualCount, estimateCount, unknownCount };
}

/**
 * Renders a total without overclaiming. Three things it deliberately does
 * not do: call a total "est." when every component is a real Riot price,
 * present a total as complete when some items had no price, or silently
 * count an unpriced item as 0 VP (which is what the old
 * `reduce((sum, s) => sum + (price ?? 0))` did - a loadout of five knives
 * used to total 0 and look like a real answer).
 */
export function formatPriceTotal(total: PriceTotal): string {
  const amount = `${total.vp.toLocaleString()} VP`;
  const approximate = total.estimateCount > 0 ? `${amount} est.` : amount;
  return total.unknownCount > 0 ? `${approximate} + ${total.unknownCount} unpriced` : approximate;
}
