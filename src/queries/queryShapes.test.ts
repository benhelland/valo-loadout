// Every query function is executed here against a database that cannot be
// reached, purely to prove Prisma accepts the *shape* of the query it builds.
//
// This exists because a shape error is invisible to everything else we run.
// `listWishlistSkins` shipped passing a Prisma *select* object into an
// `include` position, which Prisma rejects at runtime ("Invalid scalar field
// `id` for include statement"). It survived lint, `tsc --noEmit`, a
// production build and the whole unit suite, then failed on the first real
// page load - because:
//
//   - TypeScript cannot see it. Excess property checking fires only on fresh
//     object literals, so handing a select-shaped *variable* to `include`
//     type-checks cleanly.
//   - `next build` does not execute page queries, so the build cannot see it.
//   - No test called any query function, so the suite could not see it.
//
// The trick that makes this cheap: Prisma validates arguments CLIENT-SIDE,
// before opening a connection. Point DATABASE_URL at an unreachable host and
// a malformed query still raises PrismaClientValidationError, while a
// well-formed one gets as far as a connection error. So "did this query's
// shape survive validation" is answerable with no database, no fixtures and
// no network - which is what lets it run on every CI push.
//
// The assertion is deliberately narrow: any error EXCEPT a validation error
// is a pass. We are not testing that the database works, only that the query
// we would send is one Prisma understands.

import test from "node:test";
import assert from "node:assert/strict";

// Both must happen before @/lib/db is imported, so they are set here and the
// modules under test are pulled in with dynamic import below.
process.env.DATABASE_URL = "postgresql://user:pass@127.0.0.1:1/nonexistent?sslmode=disable";

// src/lib/db.ts wraps every query in the environment check, and that check
// would fail on the unreachable host before the query itself ever ran -
// masking the very error this file looks for. It memoises on globalThis with
// `??=`, so pre-seeding a resolved promise satisfies it without touching
// production code or weakening the guard anywhere else.
(globalThis as unknown as { prismaVerification?: Promise<void> }).prismaVerification =
  Promise.resolve();

const ID = "clzzzzzzzzzzzzzzzzzzzzzzz"; // shaped like a cuid; never resolves

/**
 * Passes when the call throws anything other than a validation error, and
 * when it somehow succeeds. Fails only on PrismaClientValidationError, which
 * means the query we build is not one Prisma accepts.
 */
async function assertQueryShapeValid(label: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (err) {
    const name = (err as Error)?.constructor?.name ?? "";
    const message = (err as Error)?.message ?? "";
    if (name === "PrismaClientValidationError") {
      assert.fail(`${label} builds a query Prisma rejects:\n${message.split("\n").slice(0, 12).join("\n")}`);
    }
    // Anything else - connection refused, socket error - means validation
    // passed, which is the whole question.
  }
}

test("gallery queries build valid Prisma queries", async () => {
  const gallery = await import("@/queries/gallery");

  // The cached entry points cannot be exercised here: outside a Next request
  // context they raise "incrementalCache missing", which is not a validation
  // error, so they would pass without a query ever reaching Prisma. The
  // uncached inners are exported for exactly this, and they are what actually
  // builds the query.
  await assertQueryShapeValid("querySkinPage (no filters)", () =>
    gallery.querySkinPage({}, 1, 24),
  );
  await assertQueryShapeValid("querySkinDetail", () => gallery.querySkinDetail(ID));
  await assertQueryShapeValid("listSkins (no filters)", () => gallery.listSkins({}));
  await assertQueryShapeValid("listSkins (every filter)", () =>
    gallery.listSkins({
      weaponId: ID,
      tierId: ID,
      themeId: ID,
      color: "red",
      vibe: "clean",
      hasAnimation: true,
      search: "reaver",
      sort: "price",
      page: 2,
      pageSize: 24,
    }),
  );
  // Sort options change the orderBy branch, so each is its own shape.
  for (const sort of gallery.SORT_OPTIONS) {
    await assertQueryShapeValid(`listSkins (sort=${sort})`, () => gallery.listSkins({ sort }));
  }
  // Search takes a two-phase path distinct from the plain listing.
  await assertQueryShapeValid("listSkins (search only)", () => gallery.listSkins({ search: "vandal" }));
  await assertQueryShapeValid("getSkinDetail", () => gallery.getSkinDetail(ID));
  await assertQueryShapeValid("getBuddy", () => gallery.getBuddy(ID));
});

test("buddy queries build valid Prisma queries", async () => {
  const buddies = await import("@/queries/buddies");

  await assertQueryShapeValid("listBuddiesPage (no filters)", () => buddies.listBuddiesPage({}));
  await assertQueryShapeValid("listBuddiesPage (all filters)", () =>
    buddies.listBuddiesPage({ search: "gecko", color: "green", page: 2, pageSize: 24 }),
  );
  await assertQueryShapeValid("getBuddyColorOptions", () => buddies.getBuddyColorOptions());
});

test("loadout queries build valid Prisma queries", async () => {
  const loadouts = await import("@/queries/loadouts");

  await assertQueryShapeValid("listLoadouts", () => loadouts.listLoadouts(ID));
  await assertQueryShapeValid("getLoadout", () => loadouts.getLoadout(ID, ID));
  await assertQueryShapeValid("listAllWeapons", () => loadouts.listAllWeapons());
  await assertQueryShapeValid("getSharedLoadout", () => loadouts.getSharedLoadout("some-share-slug"));
  await assertQueryShapeValid("listLoadoutSummaries", () => loadouts.listLoadoutSummaries(ID));
  await assertQueryShapeValid("getLoadoutMembership", () => loadouts.getLoadoutMembership(ID, [ID]));
});

test("wishlist queries build valid Prisma queries", async () => {
  const wishlist = await import("@/queries/wishlist");

  // The exact call that shipped broken. It is the reason this file exists, so
  // it is named rather than left implicit in a loop.
  await assertQueryShapeValid("listWishlistSkins", () => wishlist.listWishlistSkins(ID));
  await assertQueryShapeValid("getWishlistedSkinIds", () => wishlist.getWishlistedSkinIds(ID, [ID]));
  await assertQueryShapeValid("isSkinWishlisted", () => wishlist.isSkinWishlisted(ID, ID));
});

test("shop queries build valid Prisma queries", async () => {
  const shop = await import("@/queries/shop");
  await assertQueryShapeValid("getShopForUser", () => shop.getShopForUser(ID));
});

// A test that silently stops covering things is worse than no test. This
// fails when a query function is added to src/queries/ without being
// exercised above, so the coverage cannot quietly erode - the same
// opt-out-with-a-reason approach as payloadBudget.test.ts.
const COVERED = new Set([
  "listSkins",
  "getSkinDetail",
  "querySkinPage",
  "querySkinDetail",
  "getBuddy",
  "listBuddiesPage",
  "getBuddyColorOptions",
  "listLoadouts",
  "getLoadout",
  "listAllWeapons",
  "getSharedLoadout",
  "listLoadoutSummaries",
  "getLoadoutMembership",
  "listWishlistSkins",
  "getWishlistedSkinIds",
  "isSkinWishlisted",
  "getShopForUser",
]);

// Wrapped in unstable_cache, which throws "Invariant: incrementalCache
// missing" outside a Next request context. Calling them here would raise that
// instead of ever reaching Prisma, so they would pass without validating
// anything - a false negative is worse than an acknowledged gap. Their inner
// queries are plain `select` reads with no relation traversal, which is the
// shape least likely to hit this class of bug.
const NOT_EXERCISABLE = new Map([
  ["getFilterOptions", "unstable_cache - needs a Next request context"],
  ["getPriceEstimates", "unstable_cache - needs a Next request context"],
]);

test("every query function is exercised or explicitly excused", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");

  const dir = join(process.cwd(), "src", "queries");
  const found: string[] = [];

  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const source = readFileSync(join(dir, file), "utf8");
    for (const m of source.matchAll(/^export async function (\w+)/gm)) found.push(m[1]);
    // Cache-wrapped queries are consts, not function declarations.
    for (const m of source.matchAll(/^export const (\w+) = (?:unstable_)?cache\(/gm)) found.push(m[1]);
  }

  const uncovered = found.filter((name) => !COVERED.has(name) && !NOT_EXERCISABLE.has(name));
  assert.deepEqual(
    uncovered,
    [],
    `New query function(s) with no shape test: ${uncovered.join(", ")}. ` +
      `Add a call in this file, or add it to NOT_EXERCISABLE with a reason.`,
  );

  // Guards the other direction: a name left in COVERED after the function it
  // named was renamed or deleted would look like coverage that no longer exists.
  const stale = [...COVERED, ...NOT_EXERCISABLE.keys()].filter((name) => !found.includes(name));
  assert.deepEqual(stale, [], `Listed but no longer present in src/queries/: ${stale.join(", ")}`);
});
