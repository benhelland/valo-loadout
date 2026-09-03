import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectionGroupFilter,
  collectionGroupFor,
  groupCollections,
  CHAMPIONS_COLLECTION_GROUP_ID,
  VCT_COLLECTION_GROUP_ID,
} from "@/lib/collectionGroups";
import type { Theme } from "@/generated/prisma/client";

const theme = (displayName: string, id = displayName): Theme => ({
  id,
  displayName,
  displayIconUrl: null,
});

describe("collectionGroupFor", () => {
  it("matches every real VCT theme shape in the catalog", () => {
    // All 56 distinct VCT names in the live catalog take one of these forms.
    for (const name of ["VCT x G2", "VCT26 x EG", "VCT 2025 Season", "VCT LOCK//IN", "vct x fnc"]) {
      assert.equal(collectionGroupFor(name), VCT_COLLECTION_GROUP_ID, name);
    }
  });

  it("matches every Champions year", () => {
    for (const year of [2021, 2022, 2023, 2024, 2025]) {
      assert.equal(collectionGroupFor(`Champions ${year}`), CHAMPIONS_COLLECTION_GROUP_ID);
    }
  });

  it("keeps Champions and VCT in separate groups", () => {
    // Both esports, but deliberately not merged - Champions holds skins
    // people search for by name.
    assert.notEqual(collectionGroupFor("Champions 2022"), collectionGroupFor("VCT x G2"));
  });

  it("doesn't group unrelated collections", () => {
    for (const name of ["Reaver", "Elderflame", "Prime", "Evori Dreamwings"]) {
      assert.equal(collectionGroupFor(name), null, name);
    }
  });
});

describe("collectionGroupFilter", () => {
  it("returns a prefix filter for each group id", () => {
    assert.deepEqual(collectionGroupFilter(VCT_COLLECTION_GROUP_ID), {
      theme: { displayName: { startsWith: "VCT", mode: "insensitive" } },
    });
    assert.deepEqual(collectionGroupFilter(CHAMPIONS_COLLECTION_GROUP_ID), {
      theme: { displayName: { startsWith: "Champions", mode: "insensitive" } },
    });
  });

  it("returns null for a real theme uuid so it's queried normally", () => {
    assert.equal(collectionGroupFilter("2a43a7c0-45b5-2dbb-5c48-be8b40c35d9a"), null);
  });

  it("agrees with collectionGroupFor about who belongs to a group", () => {
    // The drift guard: the dropdown hides themes via collectionGroupFor and
    // the query re-selects them via collectionGroupFilter's prefix. If those
    // ever disagreed, the option would filter to something other than what
    // it replaced.
    for (const name of ["VCT x G2", "Champions 2022", "Reaver"]) {
      const groupId = collectionGroupFor(name);
      if (!groupId) continue;
      const filter = collectionGroupFilter(groupId);
      const prefix = filter?.theme && "displayName" in filter.theme ? String((filter.theme.displayName as { startsWith: string }).startsWith) : "";
      assert.ok(name.toUpperCase().startsWith(prefix.toUpperCase()), `${name} vs ${prefix}`);
    }
  });
});

describe("groupCollections", () => {
  it("collapses each family into exactly one entry", () => {
    const grouped = groupCollections([
      theme("Reaver"),
      theme("VCT x G2"),
      theme("VCT x FNC"),
      theme("VCT26 x EG"),
      theme("Champions 2021"),
      theme("Champions 2022"),
      theme("Elderflame"),
    ]);

    const vct = grouped.filter((t) => t.id === VCT_COLLECTION_GROUP_ID);
    const champions = grouped.filter((t) => t.id === CHAMPIONS_COLLECTION_GROUP_ID);
    assert.equal(vct.length, 1);
    assert.equal(champions.length, 1);
    assert.match(vct[0].displayName, /3 team capsules/);
    assert.match(champions[0].displayName, /2 years/);

    assert.deepEqual(
      grouped.filter((t) => !t.id.startsWith("group:")).map((t) => t.displayName),
      ["Elderflame", "Reaver"],
    );
  });

  it("keeps the list alphabetical so groups don't land at the end", () => {
    const names = groupCollections([
      theme("Zedd"),
      theme("VCT x G2"),
      theme("Champions 2021"),
      theme("Abyssal"),
    ]).map((t) => t.displayName);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  });

  it("emits no group entry for a family with no members", () => {
    const grouped = groupCollections([theme("Reaver"), theme("Champions 2021")]);
    assert.equal(grouped.some((t) => t.id === VCT_COLLECTION_GROUP_ID), false);
    assert.equal(grouped.some((t) => t.id === CHAMPIONS_COLLECTION_GROUP_ID), true);
  });

  it("returns everything untouched when nothing is groupable", () => {
    const input = [theme("Prime"), theme("Reaver")];
    assert.deepEqual(groupCollections(input), input);
  });
});
