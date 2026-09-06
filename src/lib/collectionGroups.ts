import type { Prisma } from "@/generated/prisma/client";

// Two distinct reasons a "collection" in the Collection dropdown might need
// grouping, handled by two different mechanisms below:
//
// 1. Esports drops (VCT, Champions) - valorant-api.com models each capsule/
//    year as its own theme, producing dozens of near-identical single-skin
//    entries that bury everything else. Fixed set of PREFIX groups, curated
//    deliberately (see COLLECTION_GROUPS) because which esports families
//    should or shouldn't merge is a judgment call, not something derivable
//    from the data alone.
//
// 2. Re-released collections. As of 2026-09-02, 20 duplicated names
//    ("Reaver", "Magepunk", "RGX 11z Pro", ...) map to 44 theme rows in
//    total, because Riot re-releases a collection as a
//    genuinely new theme with the same display name rather than versioning
//    the original (Reaver alone is 3 separate skin lineups: the 2020
//    original, a 2.0 wave, and a newest Bandit/Butterfly Knife drop - all
//    literally named "Reaver"). Handled generically by exact-name dedup
//    below, NOT a curated list: any name shared by more than one theme
//    collapses automatically, so a future re-release needs no code change to
//    stop showing as an unlabeled duplicate.
//
// Both are purely browse-time groupings. Nothing in the database is merged:
// a skin's detail page always shows its own real theme, and per-release
// browsing is still reachable through search ("Reaver Bandit").

interface CollectionGroupDefinition {
  /** Synthetic themeId. Prefixed so it can never collide with a real uuid. */
  id: string;
  /** Case-insensitive display-name prefix identifying members. */
  prefix: string;
  /** Dropdown label, given how many real themes it stands in for. */
  label: (themeCount: number) => string;
}

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

// Namespace for the generic re-release groups. The synthetic id carries the
// exact display name itself (URL-encoded) rather than a list of theme uuids -
// simpler, and it's what the query side matches back against, so the two
// can't drift the way a hand-maintained id list could.
const NAME_GROUP_PREFIX = "group:name:";

function nameGroupId(displayName: string): string {
  return `${NAME_GROUP_PREFIX}${encodeURIComponent(displayName)}`;
}

/** The curated (VCT/Champions) group a theme belongs to, or null. */
export function collectionGroupFor(displayName: string): string | null {
  return COLLECTION_GROUPS.find((group) => displayName.toUpperCase().startsWith(group.prefix.toUpperCase()))?.id ?? null;
}

/**
 * The Prisma `where` fragment selecting every skin in a grouped collection -
 * curated prefix group or generic same-name group alike - or null when the
 * id isn't a group (a real theme uuid, queried normally by the caller).
 */
export function collectionGroupFilter(themeId: string): Prisma.SkinWhereInput | null {
  if (themeId.startsWith(NAME_GROUP_PREFIX)) {
    const displayName = decodeURIComponent(themeId.slice(NAME_GROUP_PREFIX.length));
    return { theme: { displayName: { equals: displayName, mode: "insensitive" } } };
  }
  const group = COLLECTION_GROUPS.find((candidate) => candidate.id === themeId);
  return group ? { theme: { displayName: { startsWith: group.prefix, mode: "insensitive" } } } : null;
}

/**
 * Replaces each curated family and each set of same-named themes with one
 * entry, keeping the list alphabetical. A name appearing exactly once passes
 * through untouched - most collections aren't re-released, and this must
 * never turn "Elderflame" into a one-item group.
 */
// Structurally typed to the fields it reads, so callers can hand it a
// narrowed selection rather than full theme rows.
export function groupCollections<T extends { id: string; displayName: string }>(themes: T[]): T[] {
  const kept: T[] = [];
  const membersByPrefixGroup = new Map<string, T[]>();
  const membersByName = new Map<string, T[]>();

  for (const theme of themes) {
    const prefixGroupId = collectionGroupFor(theme.displayName);
    if (prefixGroupId) {
      const members = membersByPrefixGroup.get(prefixGroupId) ?? [];
      members.push(theme);
      membersByPrefixGroup.set(prefixGroupId, members);
      continue;
    }
    const members = membersByName.get(theme.displayName) ?? [];
    members.push(theme);
    membersByName.set(theme.displayName, members);
  }

  for (const group of COLLECTION_GROUPS) {
    const members = membersByPrefixGroup.get(group.id);
    if (!members?.length) continue;
    // Cast: a grouped option is synthetic, standing in for many real theme
    // rows, so it has an id and a label but no underlying row of its own.
    kept.push({ id: group.id, displayName: group.label(members.length) } as T);
  }

  for (const [displayName, members] of membersByName) {
    if (members.length === 1) {
      kept.push(members[0]);
      continue;
    }
    // Deliberately no "(3 releases)" suffix here, unlike the curated groups
    // above. This isn't an aggregate bucket a user should be aware spans
    // multiple things - it's the same collection they already know, just
    // fixing a data-modeling artifact where Riot re-releases got separate
    // rows. The plain name is the honest label.
    kept.push({ id: nameGroupId(displayName), displayName } as T);
  }

  return kept.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
