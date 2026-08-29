// Board/buy-menu ordering for weapon categories, matching the real game's
// purchase menu grouping (Sidearms -> SMGs -> Shotguns -> Rifles -> Snipers
// -> Heavies -> Melee). Categories come from valorant-api.com's
// EEquippableCategory enum (see src/lib/valorant-api.ts).
export const CATEGORY_ORDER = ["Sidearm", "SMG", "Shotgun", "Rifle", "Sniper", "Heavy", "Melee"] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  Sidearm: "Sidearms",
  SMG: "SMGs",
  Shotgun: "Shotguns",
  Rifle: "Rifles",
  Sniper: "Snipers",
  Heavy: "Heavy",
  Melee: "Melee",
};

export function categoryRank(category: string | null | undefined): number {
  const index = CATEGORY_ORDER.indexOf((category ?? "") as (typeof CATEGORY_ORDER)[number]);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

export function sortByWeaponOrder<T extends { category: string | null; displayName: string }>(weapons: T[]): T[] {
  return [...weapons].sort((a, b) => {
    const rankDiff = categoryRank(a.category) - categoryRank(b.category);
    if (rankDiff !== 0) return rankDiff;
    return a.displayName.localeCompare(b.displayName);
  });
}

// Which categories stack together in one column of the loadout board, per
// the reference loadout-chart layout: Sidearms alone; SMGs+Shotguns;
// Rifles+Melee; Snipers+Heavy machine guns.
export const BOARD_COLUMN_GROUPS: readonly (readonly string[])[] = [
  ["Sidearm"],
  ["SMG", "Shotgun"],
  ["Rifle", "Melee"],
  ["Sniper", "Heavy"],
];
