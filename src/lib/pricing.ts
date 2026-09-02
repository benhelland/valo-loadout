// Skin pricing. Two sources, in strict preference order:
//
//   1. `skins.priceVp` - a REAL price Riot quoted, harvested from storefront
//      responses we already fetch (src/store-check/recordObservedPrices).
//      A known real price ALWAYS wins; nothing below can override it.
//   2. An estimate *derived from those same real prices*, for skins we
//      haven't observed yet.
//
// There are deliberately no hardcoded price constants in this file any more.
// The previous version had a static tier -> price table, and measurement
// against live Riot data showed it could not be right:
//
//   Prism Spectre        SMG      Deluxe     real 1275   est 1275  ok
//   Elderflame Operator  Sniper   Ultra      real 2475   est 2475  ok
//   RGX 11z Pro Vandal   Rifle    Exclusive  real 2175   est 2895  WRONG
//   Aeris Vandal         Rifle    Exclusive  real 2375   est 2895  WRONG
//   Suit of Aeris        Melee    Exclusive  real 5350   est 2895  WRONG
//
// "Exclusive" isn't a price point (2175 and 2375 both observed on the same
// day - it's the tier Riot uses for one-off and bundle-special skins), and
// melee sits on a different scale that isn't a fixed multiple of the gun
// price either. Replacing one set of guessed constants with a better-guessed
// set would have repeated the same mistake, so estimates are now inferred
// from observations and can only ever assert a price Riot has actually been
// seen to charge.

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
 * A (tier, is-melee) group we've seen enough consistent real prices for to
 * extrapolate from. Melee is split out because it is demonstrably a separate
 * scale; category is otherwise ignored, since observed gun prices agree
 * across weapon types at the same tier (Deluxe SMG 1275 = the Deluxe gun
 * price).
 */
export type EstimateTable = ReadonlyMap<string, number>;

export function estimateKey(tierDevName: string, isMelee: boolean): string {
  return `${tierDevName}:${isMelee ? "melee" : "gun"}`;
}

// How many agreeing observations a group needs before it's allowed to price
// skins we haven't seen. One is too few - a single sighting of an Exclusive
// gun at 2175 would have confidently mispriced every other Exclusive gun,
// which is exactly the failure being fixed. Three agreeing observations is
// cheap to reach for genuinely uniform tiers and effectively unreachable for
// heterogeneous ones, which is the discrimination we want.
export const MIN_OBSERVATIONS_TO_ESTIMATE = 3;

export interface PriceObservation {
  tierDevName: string;
  isMelee: boolean;
  priceVp: number;
}

/**
 * Builds the estimate table from real observations. A group contributes an
 * estimate only if it has at least MIN_OBSERVATIONS_TO_ESTIMATE of them and
 * they ALL agree - a group with any disagreement (Exclusive, in practice)
 * yields no estimate at all rather than a mean or a mode, because a
 * plausible-looking average is precisely the kind of confident wrongness
 * this replaced.
 *
 * Pure and synchronous so it's directly testable; the DB read that feeds it
 * lives in src/queries/prices.ts.
 */
export function deriveEstimates(observations: PriceObservation[]): EstimateTable {
  const seen = new Map<string, Set<number>>();
  const counts = new Map<string, number>();

  for (const o of observations) {
    const key = estimateKey(o.tierDevName, o.isMelee);
    const prices = seen.get(key) ?? new Set<number>();
    prices.add(o.priceVp);
    seen.set(key, prices);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const table = new Map<string, number>();
  for (const [key, prices] of seen) {
    if (prices.size !== 1) continue;
    if ((counts.get(key) ?? 0) < MIN_OBSERVATIONS_TO_ESTIMATE) continue;
    table.set(key, [...prices][0]);
  }
  return table;
}

/**
 * The price to show for a skin, or null when we genuinely don't know.
 * Callers must render `source === "estimate"` differently - see the "~"
 * marker in SkinCard and the note in SkinDetailView.
 */
export function resolveSkinPrice(skin: PriceableSkin, estimates: EstimateTable): SkinPrice | null {
  // A real price always wins outright - never second-guessed by the model.
  if (typeof skin.priceVp === "number") return { vp: skin.priceVp, source: "actual" };

  const tier = skin.contentTier?.devName;
  if (!tier) return null;
  const estimate = estimates.get(estimateKey(tier, skin.weapon?.category === "Melee"));
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
export function totalSkinPrice(skins: PriceableSkin[], estimates: EstimateTable): PriceTotal {
  let vp = 0;
  let actualCount = 0;
  let estimateCount = 0;
  let unknownCount = 0;

  for (const skin of skins) {
    const price = resolveSkinPrice(skin, estimates);
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
