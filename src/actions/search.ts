"use server";

import { prisma } from "@/lib/db";
import { fuzzyScore } from "@/lib/fuzzyMatch";

export interface SkinSuggestion {
  id: string;
  displayName: string;
  displayIconUrl: string | null;
  weaponName: string | null;
}

// Powers the search bar's predictive dropdown - a fast, small lookup
// distinct from the full filtered grid (see listSkins in
// src/queries/gallery.ts, which fuzzy-ranks the same way for the grid
// itself). Scoped to an optional weaponId so the loadout picker's dropdown
// only suggests skins valid for the slot it's open on. The catalog is small
// enough (~1365 real skins, usually far fewer once weapon-scoped) that
// fetching the candidate set and fuzzy-ranking in JS is simpler and just as
// fast as anything fancier at this scale.
export async function searchSkinsAutocomplete(query: string, weaponId?: string): Promise<SkinSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const candidates = await prisma.skin.findMany({
    where: {
      contentTierId: { not: null },
      ...(weaponId ? { weaponId } : {}),
    },
    select: { id: true, displayName: true, displayIconUrl: true, weapon: { select: { displayName: true } } },
  });

  return candidates
    .map((c) => ({ c, score: fuzzyScore(trimmed, c.displayName) }))
    .filter((x): x is { c: (typeof candidates)[number]; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ c }) => ({
      id: c.id,
      displayName: c.displayName,
      displayIconUrl: c.displayIconUrl,
      weaponName: c.weapon?.displayName ?? null,
    }));
}
