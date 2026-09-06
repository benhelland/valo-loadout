import test from "node:test";
import assert from "node:assert/strict";
import { loadoutItemImageUrl } from "./loadoutItemImage";

// A chroma is a different-coloured gun, not a detail, so failing to render it
// silently shows the user something other than what they picked and saved. The
// selection round-trips through the database correctly, which is what makes
// this worth pinning: only the render was ever wrong, so nothing about the
// stored data would reveal a regression here.

const SKIN = { displayIconUrl: "skin.png" };

test("prefers the chroma's full render over everything else", () => {
  assert.equal(
    loadoutItemImageUrl({
      skin: SKIN,
      level: { displayIconUrl: "level.png" },
      chroma: { fullRenderUrl: "chroma-full.png", displayIconUrl: "chroma-icon.png" },
    }),
    "chroma-full.png",
  );
});

test("falls back to the chroma's icon when it has no full render", () => {
  // Confirmed against real data: a chroma often populates only one of the two.
  assert.equal(
    loadoutItemImageUrl({
      skin: SKIN,
      chroma: { fullRenderUrl: null, displayIconUrl: "chroma-icon.png" },
    }),
    "chroma-icon.png",
  );
});

test("uses the level image when no chroma was chosen", () => {
  assert.equal(
    loadoutItemImageUrl({ skin: SKIN, level: { displayIconUrl: "level.png" }, chroma: null }),
    "level.png",
  );
});

test("falls back to the skin when neither chroma nor level has art", () => {
  assert.equal(loadoutItemImageUrl({ skin: SKIN }), "skin.png");
  assert.equal(
    loadoutItemImageUrl({ skin: SKIN, level: { displayIconUrl: null }, chroma: { fullRenderUrl: null, displayIconUrl: null } }),
    "skin.png",
  );
});

test("returns null rather than an empty string when nothing has art", () => {
  // Some skins genuinely have no displayIconUrl. Callers branch on null to
  // render the weapon outline instead, so an empty string would slip through
  // that check and render a broken image.
  assert.equal(loadoutItemImageUrl({ skin: { displayIconUrl: null } }), null);
});

test("handles an empty slot", () => {
  assert.equal(loadoutItemImageUrl(null), null);
  assert.equal(loadoutItemImageUrl(undefined), null);
});
