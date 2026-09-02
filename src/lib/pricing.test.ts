import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveEstimates,
  estimateKey,
  resolveSkinPrice,
  totalSkinPrice,
  formatPriceTotal,
  MIN_OBSERVATIONS_TO_ESTIMATE,
  type PriceObservation,
} from "@/lib/pricing";

// These guard the exact failure this module was rewritten to fix: a pricing
// model that confidently asserted numbers Riot had never charged. Every case
// below is drawn from real observed data (see docs/ARCHITECTURE.md "Real VP
// prices"), not invented.

const gun = (tier: string, priceVp: number): PriceObservation => ({ tierDevName: tier, isMelee: false, priceVp });
const melee = (tier: string, priceVp: number): PriceObservation => ({ tierDevName: tier, isMelee: true, priceVp });

describe("deriveEstimates", () => {
  it("estimates from a group whose observations all agree", () => {
    const table = deriveEstimates([gun("Deluxe", 1275), gun("Deluxe", 1275), gun("Deluxe", 1275)]);
    assert.equal(table.get(estimateKey("Deluxe", false)), 1275);
  });

  it("refuses to estimate when observations disagree", () => {
    // Real data: Exclusive guns were seen at BOTH 2175 and 2375 on the same
    // day. Any single number here would be wrong for some skins.
    const table = deriveEstimates([
      gun("Exclusive", 2175),
      gun("Exclusive", 2175),
      gun("Exclusive", 2375),
      gun("Exclusive", 2375),
    ]);
    assert.equal(table.get(estimateKey("Exclusive", false)), undefined);
  });

  it("refuses to estimate from too few observations even when they agree", () => {
    const observations = Array.from({ length: MIN_OBSERVATIONS_TO_ESTIMATE - 1 }, () => gun("Ultra", 2475));
    assert.equal(deriveEstimates(observations).get(estimateKey("Ultra", false)), undefined);
  });

  it("keeps melee separate from guns at the same tier", () => {
    // Suit of Aeris (melee, Exclusive) was 5350 while that bundle's Exclusive
    // guns were 2375 - melee is a different scale, not a multiplier.
    const table = deriveEstimates([
      gun("Premium", 1775),
      gun("Premium", 1775),
      gun("Premium", 1775),
      melee("Premium", 3550),
      melee("Premium", 3550),
      melee("Premium", 3550),
    ]);
    assert.equal(table.get(estimateKey("Premium", false)), 1775);
    assert.equal(table.get(estimateKey("Premium", true)), 3550);
  });

  it("returns an empty table for no observations", () => {
    assert.equal(deriveEstimates([]).size, 0);
  });
});

describe("resolveSkinPrice", () => {
  const estimates = deriveEstimates([gun("Ultra", 2475), gun("Ultra", 2475), gun("Ultra", 2475)]);

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
  const estimates = deriveEstimates([gun("Ultra", 2475), gun("Ultra", 2475), gun("Ultra", 2475)]);

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
    assert.deepEqual(total, { vp: 5350, actualCount: 1, estimateCount: 0, unknownCount: 1 });
    assert.equal(formatPriceTotal(total), "5,350 VP + 1 unpriced");
  });

  it("does not label a total as an estimate when every part is real", () => {
    const total = totalSkinPrice(
      [{ priceVp: 2175, contentTier: { devName: "Exclusive" }, weapon: { category: "Rifle" } }],
      estimates,
    );
    assert.equal(formatPriceTotal(total), "2,175 VP");
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
