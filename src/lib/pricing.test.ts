import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveEstimates,
  estimateKey,
  resolveSkinPrice,
  totalSkinPrice,
  formatPriceTotal,
  MIN_THEMES_TO_ESTIMATE,
  type PriceObservation,
} from "@/lib/pricing";

// These guard the exact failure this module was rewritten to fix: a pricing
// model that confidently asserted numbers Riot had never charged. Every case
// below is drawn from real observed data (see docs/ARCHITECTURE.md "Real VP
// prices"), not invented.

const gun = (tier: string, priceVp: number, themeId = "t1"): PriceObservation => ({ tierDevName: tier, isMelee: false, priceVp, themeId });
const melee = (tier: string, priceVp: number, themeId = "t1"): PriceObservation => ({ tierDevName: tier, isMelee: true, priceVp, themeId });

describe("deriveEstimates", () => {
  it("estimates from a group that agrees across enough distinct themes", () => {
    const table = deriveEstimates([gun("Deluxe", 1275, "a"), gun("Deluxe", 1275, "b")]);
    assert.deepEqual(table.get(estimateKey("Deluxe", false)), { min: 1275, max: 1275 });
  });

  it("reports a range, not a mean, when observations disagree", () => {
    // Real data: Exclusive guns were seen at BOTH 2175 and 2375. Collapsing
    // that to one number would be wrong for some skins; a range is composed
    // only of figures Riot has actually charged.
    const table = deriveEstimates([
      gun("Exclusive", 2175, "a"),
      gun("Exclusive", 2175, "b"),
      gun("Exclusive", 2375, "c"),
      gun("Exclusive", 2375, "d"),
    ]);
    assert.deepEqual(table.get(estimateKey("Exclusive", false)), { min: 2175, max: 2375 });
  });

  it("does not treat many skins from ONE bundle as multiple data points", () => {
    // The 47-skin VCT capsule haul is a single price decision, not 47.
    // Ultra is seeded, so assert against a non-seeded tier to isolate the
    // derivation rule itself.
    assert.ok(MIN_THEMES_TO_ESTIMATE > 1);
    const oneBundle = Array.from({ length: 20 }, () => gun("Exclusive", 2175, "same-theme"));
    assert.equal(deriveEstimates(oneBundle).get(estimateKey("Exclusive", false)), undefined);
  });

  it("needs two themes for a range too, not just for an exact estimate", () => {
    const oneBundle = [melee("Exclusive", 3550, "a"), melee("Exclusive", 5350, "a")];
    assert.equal(deriveEstimates(oneBundle).get(estimateKey("Exclusive", true)), undefined);
  });

  it("ranges melee separately from guns of the same tier", () => {
    const table = deriveEstimates([
      gun("Exclusive", 2175, "a"),
      gun("Exclusive", 2375, "b"),
      melee("Exclusive", 3550, "a"),
      melee("Exclusive", 5350, "b"),
    ]);
    assert.deepEqual(table.get(estimateKey("Exclusive", false)), { min: 2175, max: 2375 });
    assert.deepEqual(table.get(estimateKey("Exclusive", true)), { min: 3550, max: 5350 });
  });

  it("seeds standard gun tiers so a cold start isn't all Unknown", () => {
    const table = deriveEstimates([]);
    assert.deepEqual(table.get(estimateKey("Select", false)), { min: 875, max: 875 });
    assert.deepEqual(table.get(estimateKey("Deluxe", false)), { min: 1275, max: 1275 });
    assert.deepEqual(table.get(estimateKey("Premium", false)), { min: 1775, max: 1775 });
    assert.deepEqual(table.get(estimateKey("Ultra", false)), { min: 2475, max: 2475 });
  });

  it("never seeds Exclusive or melee - the two cases that were badly wrong", () => {
    const table = deriveEstimates([]);
    assert.equal(table.get(estimateKey("Exclusive", false)), undefined);
    assert.equal(table.get(estimateKey("Exclusive", true)), undefined);
    assert.equal(table.get(estimateKey("Ultra", true)), undefined);
  });

  it("drops a seed the moment real data contradicts it", () => {
    const table = deriveEstimates([gun("Premium", 9999, "a")]);
    assert.equal(table.get(estimateKey("Premium", false)), undefined);
  });

  it("drops a seed when real data proves the tier isn't uniform", () => {
    // Two themes disagreeing produces a range instead of the seed's single
    // value - the seed is superseded, never blended with real data.
    const table = deriveEstimates([gun("Select", 875, "a"), gun("Select", 950, "b")]);
    assert.deepEqual(table.get(estimateKey("Select", false)), { min: 875, max: 950 });
  });

  it("prefers derived data over the seed when both exist", () => {
    // Riot repriced a tier: two themes agree on a new value, so that wins.
    const table = deriveEstimates([gun("Deluxe", 1400, "a"), gun("Deluxe", 1400, "b")]);
    assert.deepEqual(table.get(estimateKey("Deluxe", false)), { min: 1400, max: 1400 });
  });

  it("keeps melee separate from guns at the same tier", () => {
    // Suit of Aeris (melee, Exclusive) was 5350 while that bundle's Exclusive
    // guns were 2375 - melee is a different scale, not a multiplier.
    const table = deriveEstimates([
      gun("Premium", 1775, "a"),
      gun("Premium", 1775, "b"),
      melee("Premium", 3550, "a"),
      melee("Premium", 3550, "b"),
    ]);
    assert.deepEqual(table.get(estimateKey("Premium", false)), { min: 1775, max: 1775 });
    assert.deepEqual(table.get(estimateKey("Premium", true)), { min: 3550, max: 3550 });
  });

  it("returns only seeded groups when there are no observations at all", () => {
    assert.equal(deriveEstimates([]).size, 4);
  });
});

describe("resolveSkinPrice", () => {
  const estimates = deriveEstimates([gun("Ultra", 2475, "a"), gun("Ultra", 2475, "b")]);

  it("always prefers a real price over an estimate", () => {
    // The user's explicit requirement: a known price wins outright. Here the
    // estimate would say 2475, but Riot actually charged 1980 for this one.
    const price = resolveSkinPrice(
      { priceVp: 1980, contentTier: { devName: "Ultra" }, weapon: { category: "Rifle" } },
      estimates,
    );
    assert.deepEqual(price, { vp: 1980, source: "actual" });
  });

  it("falls back to the derived estimate when there's no real price", () => {
    const price = resolveSkinPrice(
      { priceVp: null, contentTier: { devName: "Ultra" }, weapon: { category: "Rifle" } },
      estimates,
    );
    assert.deepEqual(price, { vp: 2475, source: "estimate" });
  });

  it("returns null rather than inventing a price for an un-estimatable group", () => {
    assert.equal(
      resolveSkinPrice({ priceVp: null, contentTier: { devName: "Exclusive" }, weapon: { category: "Melee" } }, estimates),
      null,
    );
  });

  it("returns null for a skin with no content tier", () => {
    assert.equal(resolveSkinPrice({ priceVp: null, contentTier: null, weapon: { category: "Rifle" } }, estimates), null);
  });

  it("treats a real price of 0 as absent rather than free", () => {
    // Nothing is genuinely 0 VP; a 0 would mean bad upstream data.
    const price = resolveSkinPrice(
      { priceVp: 0, contentTier: { devName: "Ultra" }, weapon: { category: "Rifle" } },
      estimates,
    );
    assert.deepEqual(price, { vp: 0, source: "actual" });
  });
});

describe("totalSkinPrice / formatPriceTotal", () => {
  const estimates = deriveEstimates([gun("Ultra", 2475, "a"), gun("Ultra", 2475, "b")]);

  it("never counts an unpriced skin as zero", () => {
    // The old reduce((sum, s) => sum + (price ?? 0)) made a loadout of five
    // knives total 0 VP and look authoritative.
    const total = totalSkinPrice(
      [
        { priceVp: 5350, contentTier: { devName: "Exclusive" }, weapon: { category: "Melee" } },
        { priceVp: null, contentTier: { devName: "Exclusive" }, weapon: { category: "Melee" } },
      ],
      estimates,
    );
    assert.deepEqual(total, { vp: 5350, vpMax: 5350, actualCount: 1, estimateCount: 0, unknownCount: 1 });
    assert.equal(formatPriceTotal(total), "5,350 VP + 1 unpriced");
  });

  it("does not label a total as an estimate when every part is real", () => {
    const total = totalSkinPrice(
      [{ priceVp: 2175, contentTier: { devName: "Exclusive" }, weapon: { category: "Rifle" } }],
      estimates,
    );
    assert.equal(formatPriceTotal(total), "2,175 VP");
  });

  it("widens a total into a range when a component is a range", () => {
    const ranged = deriveEstimates([gun("Exclusive", 2175, "a"), gun("Exclusive", 2375, "b")]);
    const total = totalSkinPrice(
      [
        { priceVp: null, contentTier: { devName: "Exclusive" }, weapon: { category: "Rifle" } },
        { priceVp: null, contentTier: { devName: "Exclusive" }, weapon: { category: "Rifle" } },
      ],
      ranged,
    );
    assert.equal(total.vp, 4350);
    assert.equal(total.vpMax, 4750);
    assert.equal(formatPriceTotal(total), "4,350-4,750 VP est.");
  });

  it("marks the total as an estimate when any part is estimated", () => {
    const total = totalSkinPrice(
      [
        { priceVp: 2175, contentTier: { devName: "Exclusive" }, weapon: { category: "Rifle" } },
        { priceVp: null, contentTier: { devName: "Ultra" }, weapon: { category: "Rifle" } },
      ],
      estimates,
    );
    assert.equal(total.vp, 2175 + 2475);
    assert.equal(formatPriceTotal(total), "4,650 VP est.");
  });
});
