import type { Theme } from "@/generated/prisma/client";

// valorant-api.com models every VCT team capsule as its own theme, so the
// catalog carries 142 of them across 56 distinct names ("VCT x G2",
// "VCT x FNC", "VCT26 x EG", ...) - each holding a single skin. Listed
// individually they were roughly a third of the Collection dropdown's 441
// entries while accounting for ~10% of the catalog, burying every other
// collection.
//
// They're collapsed into one synthetic option instead. The underlying theme
// rows are untouched: this is purely a browse-time grouping, so a skin still
// knows its real collection on its detail page, and the per-team distinction
// is still reachable through search ("VCT x G2").
//
// Deliberately NOT included: the "Champions 20xx" collections. Those are
// esports too, but Champions skins (the Champions Vandal especially) are
// famous collections people look for by name - folding them into a generic
// bucket would hide them rather than tidy them.

export const VCT_COLLECTION_GROUP_ID = "group:vct";

const VCT_NAME_PREFIX = "VCT";

/**
 * The single predicate for "is this a VCT capsule theme". Both the dropdown
 * (which hides the individuals) and the query (which has to match them all)
 * derive from this, so the two can't drift apart and leave a group option
 * that filters to something different from what it replaced.
 */
export function isVctThemeName(displayName: string): boolean {
  return displayName.toUpperCase().startsWith(VCT_NAME_PREFIX);
}

/** Prisma filter matching every skin in any VCT capsule theme. */
export const vctThemeFilter = {
  theme: { displayName: { startsWith: VCT_NAME_PREFIX, mode: "insensitive" as const } },
};

/**
 * Replaces the individual VCT themes with one grouped entry, keeping the
 * list alphabetical. Returns the input untouched when there are none.
 */
export function groupCollections(themes: Theme[]): Theme[] {
  const vct = themes.filter((theme) => isVctThemeName(theme.displayName));
  if (vct.length === 0) return themes;

  const grouped: Theme[] = [
    ...themes.filter((theme) => !isVctThemeName(theme.displayName)),
    {
      id: VCT_COLLECTION_GROUP_ID,
      // Says plainly that it's a bucket, so nobody reads it as a single
      // capsule that happens to have 142 skins in it.
      displayName: `VCT — all ${vct.length} team capsules`,
      displayIconUrl: vct.find((theme) => theme.displayIconUrl)?.displayIconUrl ?? null,
    },
  ];

  return grouped.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
