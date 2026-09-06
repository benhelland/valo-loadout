import test from "node:test";
import assert from "node:assert/strict";
import { MAX_PAGE, resolvePageSize, SKIN_PAGE_SIZES, DEFAULT_SKIN_PAGE_SIZE } from "./pageSize";

// Both of these bound work that an attacker-chosen query string would
// otherwise control. Neither shows up in a response, so a regression would be
// silent - which is what makes them worth asserting rather than reading.

test("MAX_PAGE is far past any real reader but still bounds the offset", () => {
  assert.ok(Number.isInteger(MAX_PAGE) && MAX_PAGE > 0);
  // A genuine reader must never be clamped: the catalog is a few dozen pages
  // at the smallest page size.
  assert.ok(MAX_PAGE > 100, "would clamp a page a real reader could reach");
  // And the bound has to stay small enough to matter. `skip` is
  // (page - 1) * pageSize, and Postgres reaches an OFFSET by walking and
  // discarding every preceding row, so an unbounded page makes one request
  // arbitrarily expensive. It is also part of the cached listing's key, so it
  // bounds how many distinct cache entries can be created.
  assert.ok(MAX_PAGE <= 1000, "too large to bound the offset scan or the key space");
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
