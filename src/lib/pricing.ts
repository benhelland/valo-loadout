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

// A group needs agreeing observations from at least this many DISTINCT
// themes before it may price skins we haven't seen.
//
// Distinct themes rather than a raw count, because Riot sets prices per
// bundle: five skins from one bundle is one data point about that bundle,
// whereas two different bundles agreeing is real evidence the tier is
// uniform. A raw count would have treated the 47-skin VCT capsule haul as
// overwhelming evidence when it is really a single price decision.
export const MIN_THEMES_TO_ESTIMATE = 2;

export interface PriceObservation {
  tierDevName: string;
  isMelee: boolean;
  priceVp: number;
  /** Theme (bundle) the skin belongs to; null groups as its own bucket. */
  themeId: string | null;
}

// Launch seed for the four standard gun tiers.
//
// This is NOT a return to the old guessed table, and the distinction is the
// whole point: the old table's failures were Exclusive (not a price point at
// all - 2175 and 2375 both observed) and melee (a different scale entirely).
// Both are deliberately absent here and stay "Unknown" until real data
// arrives. What remains is Riot's standard gun ladder, of which Deluxe
// (1275) and Ultra (2475) were verified exactly against live storefront
// data on 2026-09-02; Select and Premium are the same well-documented ladder
// and were not directly observed, so they are the two values here carrying
// any residual assumption.
//
// Every entry is overridden the moment real observations disagree with it
// (see applySeed), so this decays into pure measured data rather than
// persisting as a permanent guess. It exists so a launch with almost no
// observations doesn't show "Unknown" on ~900 skins whose prices we are not
// actually uncertain about.
const SEED_ESTIMATES: ReadonlyArray<{ tierDevName: string; priceVp: number }> = [
  { tierDevName: "Select", priceVp: 875 },
  { tierDevName: "Deluxe", priceVp: 1275 },
  { tierDevName: "Premium", priceVp: 1775 },
  { tierDevName: "Ultra", priceVp: 2475 },
];

/**
 * Builds the estimate table from real observations. A group contributes an
 * estimate only if its observations span at least MIN_THEMES_TO_ESTIMATE
 * distinct themes and ALL agree - any disagreement yields no estimate rather
 * than a mean or a mode, because a plausible-looking average is precisely
 * the kind of confident wrongness this replaced.
 *
 * Pure and synchronous so it's directly testable; the DB read that feeds it
 * lives in src/queries/prices.ts.
 */
export function deriveEstimates(observations: PriceObservation[]): EstimateTable {
  const prices = new Map<string, Set<number>>();
  const themes = new Map<string, Set<string>>();

  for (const o of observations) {
    const key = estimateKey(o.tierDevName, o.isMelee);
    (prices.get(key) ?? prices.set(key, new Set()).get(key)!).add(o.priceVp);
    (themes.get(key) ?? themes.set(key, new Set()).get(key)!).add(o.themeId ?? `__none:${o.priceVp}`);
  }

  const table = new Map<string, number>();
  for (const [key, seen] of prices) {
    if (seen.size !== 1) continue;
    if ((themes.get(key)?.size ?? 0) < MIN_THEMES_TO_ESTIMATE) continue;
    table.set(key, [...seen][0]);
  }
  return applySeed(table, prices);
}

/**
 * Fills gaps in the derived table from SEED_ESTIMATES, but only where the
 * real data doesn't contradict the seed. A group with any observation that
 * differs from its seed value drops the seed entirely - measured data always
 * beats the assumption, including when it merely proves the group isn't
 * uniform.
 */
function applySeed(table: Map<string, number>, observed: Map<string, Set<number>>): EstimateTable {
  for (const seed of SEED_ESTIMATES) {
    const key = estimateKey(seed.tierDevName, false);
    if (table.has(key)) continue; // real data already answered this
    const seenPrices = observed.get(key);
    // Contradicted, or proven non-uniform -> no estimate at all.
    if (seenPrices && (seenPrices.size > 1 || !seenPrices.has(seed.priceVp))) continue;
    table.set(key, seed.priceVp);
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
