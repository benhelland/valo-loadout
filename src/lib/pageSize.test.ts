import test from "node:test";
import assert from "node:assert/strict";
import { MAX_PAGE, resolvePage, resolvePageSize, SKIN_PAGE_SIZES, DEFAULT_SKIN_PAGE_SIZE } from "./pageSize";

// Both of these bound work that an attacker-chosen query string would
// otherwise control. Neither shows up in a response, so a regression would be
// silent - which is what makes them worth asserting rather than reading.

test("resolvePage clamps a page number instead of trusting it", () => {
  // The clamp bounds the cached listing's key space: `page` is part of the
  // key, so an unbounded page number is an unbounded set of cache entries,
  // each a miss that reaches the database.
  assert.equal(resolvePage("99999999"), MAX_PAGE);
  assert.equal(resolvePage(10 ** 9), MAX_PAGE);
  assert.equal(resolvePage("3"), 3);
});

test("resolvePage never returns a value Prisma cannot use as skip", () => {
  // Number("abc") is NaN, which survives Math.max/Math.min and reaches Prisma
  // as `skip: NaN` - a validation error, so an anonymous request with a junk
  // query string would return a 500. A fractional page has the same effect.
  for (const raw of ["abc", "", "  ", "NaN", "Infinity", "-Infinity", undefined, null, "1e999"]) {
    const page = resolvePage(raw);
    assert.ok(Number.isInteger(page) && page >= 1 && page <= MAX_PAGE, `resolvePage(${JSON.stringify(raw)}) = ${page}`);
  }
  assert.equal(resolvePage("1.7"), 1, "a fractional page would give a fractional skip");
  assert.equal(resolvePage("-3"), 1);
  assert.equal(resolvePage("0"), 1);
});

test("MAX_PAGE is far past any page a real reader reaches", () => {
  // The catalog is a few dozen pages at the smallest page size.
  assert.ok(Number.isInteger(MAX_PAGE) && MAX_PAGE > 100);
});

test("resolvePageSize only returns a value from the allowlist", () => {
  // The page size reaches Prisma's `take`, so an arbitrary value would let a
  // query string choose how many rows come back.
  for (const raw of ["999999", "-1", "0", "abc", "", undefined, "1e9", "48; DROP"]) {
    const resolved = resolvePageSize(raw, SKIN_PAGE_SIZES, DEFAULT_SKIN_PAGE_SIZE);
    assert.ok(
      (SKIN_PAGE_SIZES as readonly number[]).includes(resolved),
      `resolvePageSize(${JSON.stringify(raw)}) returned ${resolved}, which is not an allowed size`,
    );
  }
});

test("resolvePageSize passes an allowed value through", () => {
  for (const size of SKIN_PAGE_SIZES) {
    assert.equal(resolvePageSize(String(size), SKIN_PAGE_SIZES, DEFAULT_SKIN_PAGE_SIZE), size);
  }
});
