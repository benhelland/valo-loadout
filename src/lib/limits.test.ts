import test from "node:test";
import assert from "node:assert/strict";
import {
  MANUAL_SHOP_CHECK_COOLDOWN_MS,
  MAX_LINKED_RIOT_ACCOUNTS_PER_USER,
  MAX_LOADOUTS_PER_USER,
  MAX_NAME_LENGTH,
  MAX_WISHLIST_ITEMS_PER_USER,
  normalizeName,
} from "./limits";

// These are abuse-resistance controls, so the tests here are about the
// properties that must not silently regress - not about the exact numbers,
// which are a judgement call and may be tuned.

test("normalizeName truncates to the cap", () => {
  const long = "x".repeat(MAX_NAME_LENGTH * 100);
  assert.equal(normalizeName(long, "fallback").length, MAX_NAME_LENGTH);
});

test("normalizeName trims and falls back on empty input", () => {
  assert.equal(normalizeName("  Dark & Sleek  ", "fallback"), "Dark & Sleek");
  assert.equal(normalizeName("   ", "fallback"), "fallback");
  assert.equal(normalizeName("", "fallback"), "fallback");
});

test("normalizeName falls back for non-string input", () => {
  // Server Action arguments arrive deserialized from the client and are not
  // validated by the type system at runtime, so a non-string is reachable.
  assert.equal(normalizeName(undefined, "fallback"), "fallback");
  assert.equal(normalizeName(null, "fallback"), "fallback");
  assert.equal(normalizeName({ toString: () => "x".repeat(1000) }, "fallback"), "fallback");
  assert.equal(normalizeName(12345, "fallback"), "fallback");
});

test("normalizeName trims before truncating, so the result is never padded", () => {
  const padded = `${" ".repeat(50)}name${" ".repeat(50)}`;
  assert.equal(normalizeName(padded, "fallback"), "name");
});

test("every limit is a finite positive bound", () => {
  for (const [name, value] of Object.entries({
    MAX_LOADOUTS_PER_USER,
    MAX_WISHLIST_ITEMS_PER_USER,
    MAX_NAME_LENGTH,
    MAX_LINKED_RIOT_ACCOUNTS_PER_USER,
    MANUAL_SHOP_CHECK_COOLDOWN_MS,
  })) {
    assert.ok(Number.isFinite(value) && value > 0, `${name} must be a finite positive number`);
  }
});

test("the manual shop-check cooldown stays meaningful", () => {
  // The whole point of this one is docs/RISKS.md: outbound Riot traffic must
  // not be user-clickable at will. A cooldown under a minute would not be a
  // rate limit in any useful sense.
  assert.ok(MANUAL_SHOP_CHECK_COOLDOWN_MS >= 60_000);
});
