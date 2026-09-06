import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildStaleLinkFilter } from "@/store-check";

// This filter feeds a deleteMany against stored Riot credentials. A flipped
// comparison would delete every active link rather than the abandoned ones,
// and the damage is unrecoverable - the tokens are gone and users must
// re-link. These assert the boundary in both directions.

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-06T00:00:00.000Z");

function cutoffOf(filter: ReturnType<typeof buildStaleLinkFilter>): Date {
  const clause = filter.OR[0].lastSyncedAt;
  assert.ok(clause, "first clause must constrain lastSyncedAt");
  return clause.lt;
}

describe("buildStaleLinkFilter", () => {
  it("cuts off 180 days back, not forward", () => {
    const cutoff = cutoffOf(buildStaleLinkFilter(NOW));
    assert.ok(cutoff < NOW, "cutoff must be in the past");
    assert.equal(Math.round((NOW.getTime() - cutoff.getTime()) / DAY), 180);
  });

  it("matches on lastSyncedAt older than the cutoff", () => {
    const filter = buildStaleLinkFilter(NOW);
    const cutoff = cutoffOf(filter);
    // A link used yesterday must sit after the cutoff (i.e. be kept).
    assert.ok(new Date(NOW.getTime() - DAY) > cutoff);
    // One untouched for a year must sit before it (i.e. be deleted).
    assert.ok(new Date(NOW.getTime() - 365 * DAY) < cutoff);
  });

  it("falls back to createdAt only when a link never synced", () => {
    const filter = buildStaleLinkFilter(NOW);
    const fallback = filter.OR[1];
    assert.equal(fallback.lastSyncedAt, null, "fallback must require lastSyncedAt to be null");
    assert.ok(fallback.createdAt.lt instanceof Date);
  });

  it("uses a strictly-older comparison so a link used exactly now is kept", () => {
    const filter = buildStaleLinkFilter(NOW);
    const clause = filter.OR[0].lastSyncedAt;
    assert.ok(clause, "first clause must constrain lastSyncedAt");
    assert.ok("lt" in clause, "must be `lt`, never `gt`/`gte`");
    assert.ok(!(NOW < cutoffOf(filter)), "a just-synced link must never match");
  });
});
