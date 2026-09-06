import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildStaleLinkFilter, exceedsExpiryGuard } from "@/store-check";

// This filter feeds a deleteMany against stored Riot credentials. A flipped
// comparison would delete every active link rather than the abandoned ones,
// and the damage is unrecoverable - the tokens are gone and users must
// re-link.
//
// These assert BEHAVIOUR ("is this link deleted?") rather than the filter's
// internal shape. Asserting on shape - reaching into `filter.OR[0]` and friends
// - fails in both directions: a restructure that keeps the semantics identical
// breaks every test, while a change that quietly alters which links match can
// still pass. The evaluator below interprets the small subset of Prisma filter
// syntax this filter uses, so the tests read as the question the code answers.

const DAY = 24 * 60 * 60 * 1000;
// Arbitrary and fixed, so the boundary cases are deterministic. Nothing about
// this instant matters beyond it not being "now".
const NOW = new Date("2030-06-01T00:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

interface Link {
  createdAt: Date;
  lastSyncedAt: Date | null;
  lastManualCheckAt: Date | null;
}

/** Evaluates the AND/OR/lt/null subset that buildStaleLinkFilter produces. */
function matches(link: Link, filter: unknown): boolean {
  const node = filter as Record<string, unknown>;

  if (Array.isArray(node.AND)) return node.AND.every((c) => matches(link, c));
  if (Array.isArray(node.OR)) return node.OR.some((c) => matches(link, c));

  return Object.entries(node).every(([field, condition]) => {
    const value = link[field as keyof Link];
    if (condition === null) return value === null;
    const lt = (condition as { lt?: Date }).lt;
    if (lt instanceof Date) return value !== null && value < lt;
    throw new Error(`test evaluator does not understand condition on ${field}`);
  });
}

const isStale = (link: Link) => matches(link, buildStaleLinkFilter(NOW));

describe("buildStaleLinkFilter", () => {
  it("deletes a link nothing has touched in over 180 days", () => {
    assert.equal(
      isStale({ createdAt: ago(400), lastSyncedAt: ago(300), lastManualCheckAt: null }),
      true,
    );
  });

  it("keeps a link that synced recently", () => {
    assert.equal(
      isStale({ createdAt: ago(400), lastSyncedAt: ago(1), lastManualCheckAt: null }),
      false,
    );
  });

  it("keeps a link kept alive only by the manual check button", () => {
    // The case with the sharpest consequences. lastSyncedAt moves only on a
    // SUCCESSFUL poll, so it stays null for every link the scheduled poller has
    // never reached - which is all of them when no poller is running. Treating
    // that as abandonment would delete active users' credentials on the first
    // scheduled run after a long gap. lastManualCheckAt is stamped whenever a
    // user presses the button, success or failure, so it is the signal that
    // represents someone actually asking for something.
    assert.equal(
      isStale({ createdAt: ago(400), lastSyncedAt: null, lastManualCheckAt: ago(2) }),
      false,
    );
  });

  it("deletes a link that never synced and was never checked by hand", () => {
    assert.equal(
      isStale({ createdAt: ago(400), lastSyncedAt: null, lastManualCheckAt: null }),
      true,
    );
  });

  it("never deletes a link created inside the window, whatever else is null", () => {
    // createdAt is ANDed unconditionally, so a link made moments ago cannot
    // match however the activity columns look.
    assert.equal(
      isStale({ createdAt: ago(1), lastSyncedAt: null, lastManualCheckAt: null }),
      false,
    );
  });

  it("requires EVERY signal to be stale, not merely one", () => {
    // A stale sync plus a fresh manual check is an active link.
    assert.equal(
      isStale({ createdAt: ago(400), lastSyncedAt: ago(300), lastManualCheckAt: ago(1) }),
      false,
    );
  });

  it("uses a strictly-older comparison, so the boundary is kept not deleted", () => {
    const exactly = ago(180);
    assert.equal(
      isStale({ createdAt: exactly, lastSyncedAt: exactly, lastManualCheckAt: exactly }),
      false,
      "a link exactly at the cutoff must be kept",
    );
    assert.equal(
      isStale({ createdAt: ago(181), lastSyncedAt: ago(181), lastManualCheckAt: ago(181) }),
      true,
    );
  });

  it("cuts off backwards in time, not forwards", () => {
    // Catches a sign error in the cutoff arithmetic, which would invert the
    // whole filter and match every link instead of none.
    assert.equal(
      isStale({ createdAt: ago(-10), lastSyncedAt: ago(-10), lastManualCheckAt: ago(-10) }),
      false,
      "a link dated in the future must never match",
    );
  });
});

describe("exceedsExpiryGuard", () => {
  it("allows an ordinary cleanup", () => {
    assert.equal(exceedsExpiryGuard(2, 100), false);
    assert.equal(exceedsExpiryGuard(50, 100), false, "exactly half is allowed");
  });

  it("refuses to delete a majority in one run", () => {
    // The shape of a filter bug: it matches nearly everything.
    assert.equal(exceedsExpiryGuard(51, 100), true);
    assert.equal(exceedsExpiryGuard(100, 100), true, "deleting every link is never routine");
  });

  it("does not fire on a handful of links, where a proportion means nothing", () => {
    // With 4 links, "half" is two rows. Tripping the guard there would block a
    // legitimate cleanup on every run and teach the operator to ignore it.
    assert.equal(exceedsExpiryGuard(4, 4), false);
    assert.equal(exceedsExpiryGuard(3, 4), false);
  });

  it("starts guarding as soon as the sample is meaningful", () => {
    assert.equal(exceedsExpiryGuard(5, 5), true);
    assert.equal(exceedsExpiryGuard(2, 5), false);
  });
});
