import type { Prisma, Theme } from "@/generated/prisma/client";

// valorant-api.com models each esports drop as its own theme, which makes
// the Collection dropdown unusable: 142 VCT team-capsule themes across 56
// names (one skin each) were roughly a third of its 441 entries while
// accounting for ~10% of the catalog, burying every other collection.
//
// Such families collapse into a single browse-time option each. Nothing in
// the database is merged: a skin's detail page still shows its real
// collection ("VCT x 100T"), and the individual drops stay reachable through
// search. Only the filter list is condensed.
//
// VCT and Champions are kept as SEPARATE groups on purpose. Both are esports,
// but they're different things to a player: VCT capsules are ~140 near-
// identical team-branded sidearms, whereas Champions is five two-piece
// collections containing some of the most sought-after skins in the game
// (the Champions Vandal above all). Folding Champions into VCT would bury
// exactly the skins people go looking for by name.

interface CollectionGroupDefinition {
  /** Synthetic themeId. Prefixed so it can never collide with a real uuid. */
  id: string;
  /** Case-insensitive display-name prefix identifying members. */
  prefix: string;
  /** Dropdown label, given how many real themes it stands in for. */
  label: (themeCount: number) => string;
}

// Order matters only for tie-breaking; the prefixes here are disjoint.
const COLLECTION_GROUPS: readonly CollectionGroupDefinition[] = [
  {
    id: "group:vct",
    prefix: "VCT",
    label: (n) => `VCT — all ${n} team capsules`,
  },
  {
    id: "group:champions",
    prefix: "Champions",
    label: (n) => `Champions — all ${n} years`,
  },
];

export const VCT_COLLECTION_GROUP_ID = "group:vct";
export const CHAMPIONS_COLLECTION_GROUP_ID = "group:champions";

function matches(group: CollectionGroupDefinition, displayName: string): boolean {
  return displayName.toUpperCase().startsWith(group.prefix.toUpperCase());
}

/** The group a theme belongs to, or null if it stands on its own. */
export function collectionGroupFor(displayName: string): string | null {
  return COLLECTION_GROUPS.find((group) => matches(group, displayName))?.id ?? null;
}

/**
 * The Prisma `where` fragment selecting every skin in a grouped collection,
 * or null when the id isn't a group.
 *
 * This and `groupCollections` below both derive from the same COLLECTION_GROUPS
 * definitions, which is the point: if the dropdown's notion of a group ever
 * drifted from the query's, the option would silently filter to something
 * other than the themes it replaced.
 */
export function collectionGroupFilter(themeId: string): Prisma.SkinWhereInput | null {
  const group = COLLECTION_GROUPS.find((candidate) => candidate.id === themeId);
  if (!group) return null;
  return { theme: { displayName: { startsWith: group.prefix, mode: "insensitive" } } };
}

/**
 * Replaces each family of grouped themes with one entry, keeping the list
 * alphabetical. Themes belonging to no group pass through untouched.
 */
export function groupCollections(themes: Theme[]): Theme[] {
  const kept: Theme[] = [];
  const membersByGroup = new Map<string, Theme[]>();

  for (const theme of themes) {
    const groupId = collectionGroupFor(theme.displayName);
    if (!groupId) {
      kept.push(theme);
      continue;
    }
    const members = membersByGroup.get(groupId) ?? [];
    members.push(theme);
    membersByGroup.set(groupId, members);
  }

  for (const group of COLLECTION_GROUPS) {
    const members = membersByGroup.get(group.id);
    if (!members?.length) continue;
    kept.push({
      id: group.id,
      displayName: group.label(members.length),
      displayIconUrl: members.find((theme) => theme.displayIconUrl)?.displayIconUrl ?? null,
    });
  }

  return kept.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
