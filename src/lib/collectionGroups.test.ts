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

const theme = (displayName: string, id = `${displayName}-${Math.random()}`): Theme => ({
  id,
  displayName,
  displayIconUrl: null,
});

describe("collectionGroupFor (curated prefix groups)", () => {
  it("matches every real VCT theme shape in the catalog", () => {
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
    assert.notEqual(collectionGroupFor("Champions 2022"), collectionGroupFor("VCT x G2"));
  });

  it("doesn't claim an ordinary re-released collection", () => {
    // Reaver/Magepunk/etc. are handled by the generic exact-name path in
    // groupCollections, not a curated prefix - this function should have no
    // opinion about them.
    for (const name of ["Reaver", "Magepunk", "RGX 11z Pro"]) {
      assert.equal(collectionGroupFor(name), null, name);
    }
  });
});

describe("collectionGroupFilter", () => {
  it("returns a prefix filter for each curated group id", () => {
    assert.deepEqual(collectionGroupFilter(VCT_COLLECTION_GROUP_ID), {
      theme: { displayName: { startsWith: "VCT", mode: "insensitive" } },
    });
    assert.deepEqual(collectionGroupFilter(CHAMPIONS_COLLECTION_GROUP_ID), {
      theme: { displayName: { startsWith: "Champions", mode: "insensitive" } },
    });
  });

  it("returns an exact-match filter for a generic name-group id", () => {
    const id = groupCollections([theme("Reaver", "a"), theme("Reaver", "b")]).find((t) => t.displayName === "Reaver")!.id;
    assert.deepEqual(collectionGroupFilter(id), {
      theme: { displayName: { equals: "Reaver", mode: "insensitive" } },
    });
  });

  it("round-trips a name containing characters that need URL-encoding", () => {
    const id = groupCollections([theme("Prism III", "a"), theme("Prism III", "b")]).find(
      (t) => t.displayName === "Prism III",
    )!.id;
    assert.deepEqual(collectionGroupFilter(id), {
      theme: { displayName: { equals: "Prism III", mode: "insensitive" } },
    });
  });

  it("returns null for a real theme uuid so it's queried normally", () => {
    assert.equal(collectionGroupFilter("2a43a7c0-45b5-2dbb-5c48-be8b40c35d9a"), null);
  });
});

describe("groupCollections - curated prefix families", () => {
  it("collapses each family into exactly one entry", () => {
    const grouped = groupCollections([
      theme("Reaver", "r1"),
      theme("VCT x G2", "v1"),
      theme("VCT x FNC", "v2"),
      theme("VCT26 x EG", "v3"),
      theme("Champions 2021", "c1"),
      theme("Champions 2022", "c2"),
      theme("Elderflame", "e1"),
    ]);

    const vct = grouped.filter((t) => t.id === VCT_COLLECTION_GROUP_ID);
    const champions = grouped.filter((t) => t.id === CHAMPIONS_COLLECTION_GROUP_ID);
    assert.equal(vct.length, 1);
    assert.equal(champions.length, 1);
    assert.match(vct[0].displayName, /3 team capsules/);
    assert.match(champions[0].displayName, /2 years/);
  });

  it("emits no group entry for a family with no members", () => {
    const grouped = groupCollections([theme("Reaver", "r1"), theme("Reaver", "r2"), theme("Champions 2021", "c1")]);
    assert.equal(grouped.some((t) => t.id === VCT_COLLECTION_GROUP_ID), false);
    assert.equal(grouped.some((t) => t.id === CHAMPIONS_COLLECTION_GROUP_ID), true);
  });
});

describe("groupCollections - generic re-release dedup", () => {
  it("collapses same-named themes into one entry with the plain name, no count suffix", () => {
    // Real case: Reaver is 3 distinct theme rows (2020 original, a 2.0 wave,
    // and a newest Bandit/Butterfly Knife drop), all literally named
    // "Reaver". Unlike VCT/Champions, the label stays exactly "Reaver" -
    // this is fixing a data-modeling artifact, not presenting an aggregate
    // bucket the user needs to be aware of.
    const grouped = groupCollections([theme("Reaver", "r1"), theme("Reaver", "r2"), theme("Reaver", "r3")]);
    const reaver = grouped.filter((t) => t.displayName === "Reaver");
    assert.equal(reaver.length, 1);
    assert.equal(reaver[0].displayName, "Reaver");
  });

  it("leaves a name that appears only once completely untouched", () => {
    // Must never turn a normal, single-release collection into a one-item
    // "group" with a synthetic id - that would silently change its filter
    // behaviour (equals vs. the real themeId) for no reason.
    const elderflame = theme("Elderflame", "real-uuid-here");
    const grouped = groupCollections([elderflame]);
    assert.deepEqual(grouped, [elderflame]);
  });

  it("is fully automatic - a new duplicate name needs no code change to be caught", () => {
    // Simulates a future re-release under a name not in any curated list.
    const grouped = groupCollections([theme("Totally New Collection", "n1"), theme("Totally New Collection", "n2")]);
    const matches = grouped.filter((t) => t.displayName === "Totally New Collection");
    assert.equal(matches.length, 1);
    assert.ok(matches[0].id.startsWith("group:name:"));
  });

  it("does not double-handle a name that a curated prefix group already claimed", () => {
    // VCT x 100T is itself a real 3-row duplicate name in the live catalog -
    // it must be absorbed into the VCT prefix group, not ALSO produce its
    // own separate "VCT x 100T" generic group.
    const grouped = groupCollections([theme("VCT x 100T", "a"), theme("VCT x 100T", "b"), theme("VCT x 100T", "c")]);
    assert.equal(grouped.filter((t) => t.id === VCT_COLLECTION_GROUP_ID).length, 1);
    assert.equal(grouped.some((t) => t.displayName === "VCT x 100T"), false);
  });
});

describe("groupCollections - overall", () => {
  it("keeps the list alphabetical so groups don't land at the end", () => {
    const names = groupCollections([
      theme("Zedd", "z1"),
      theme("VCT x G2", "v1"),
      theme("Champions 2021", "c1"),
      theme("Reaver", "r1"),
      theme("Reaver", "r2"),
      theme("Abyssal", "a1"),
    ]).map((t) => t.displayName);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  });

  it("returns every theme as-is (content-wise) when nothing needs grouping", () => {
    // Already-alphabetical input, since the function always sorts its
    // output - this isolates "nothing was grouped/synthesized" from
    // ordering, which has its own dedicated test above.
    const input = [theme("Elderflame", "e1"), theme("Prime", "p1")];
    assert.deepEqual(groupCollections(input), input);
  });
});
