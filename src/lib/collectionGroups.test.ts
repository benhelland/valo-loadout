import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupCollections, isVctThemeName, VCT_COLLECTION_GROUP_ID } from "@/lib/collectionGroups";
import type { Theme } from "@/generated/prisma/client";

const theme = (displayName: string, id = displayName): Theme => ({
  id,
  displayName,
  displayIconUrl: null,
});

describe("isVctThemeName", () => {
  it("matches every real VCT theme shape in the catalog", () => {
    // All 56 distinct VCT names in the live catalog take one of these forms.
    for (const name of ["VCT x G2", "VCT26 x EG", "VCT 2025 Season", "VCT LOCK//IN", "vct x fnc"]) {
      assert.ok(isVctThemeName(name), name);
    }
  });

  it("leaves the Champions collections alone", () => {
    // Deliberate: Champions skins are sought by name and would be buried by
    // a generic esports bucket.
    for (const name of ["Champions 2022", "Champions 2025"]) {
      assert.equal(isVctThemeName(name), false, name);
    }
  });

  it("doesn't match unrelated collections", () => {
    for (const name of ["Reaver", "Elderflame", "Prime", "Evori Dreamwings"]) {
      assert.equal(isVctThemeName(name), false, name);
    }
  });
});

describe("groupCollections", () => {
  it("replaces every VCT theme with exactly one grouped entry", () => {
    const grouped = groupCollections([
      theme("Reaver"),
      theme("VCT x G2"),
      theme("VCT x FNC"),
      theme("VCT26 x EG"),
      theme("Elderflame"),
    ]);
    const vct = grouped.filter((t) => isVctThemeName(t.displayName));
    assert.equal(vct.length, 1);
    assert.equal(vct[0].id, VCT_COLLECTION_GROUP_ID);
    assert.match(vct[0].displayName, /3 team capsules/);
    // The non-VCT collections survive untouched.
    assert.deepEqual(
      grouped.filter((t) => !isVctThemeName(t.displayName)).map((t) => t.displayName),
      ["Elderflame", "Reaver"],
    );
  });

  it("keeps the list alphabetical so the group doesn't land at the end", () => {
    const names = groupCollections([theme("Zedd"), theme("VCT x G2"), theme("Abyssal")]).map((t) => t.displayName);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  });

  it("returns the input unchanged when there are no VCT themes", () => {
    const input = [theme("Reaver"), theme("Prime")];
    assert.deepEqual(groupCollections(input), input);
  });
});
