"use server";

import { prisma } from "@/lib/db";

export interface SkinSuggestion {
  id: string;
  displayName: string;
  displayIconUrl: string | null;
  weaponName: string | null;
}

// Fuzzy subsequence match: every character of `query` must appear in
// `target`, in order, but not necessarily contiguous - so "vct" matches
// "VCT 2026 Sigil" and typos/partial words still find things. Returns null
// for no match, otherwise a score where higher is a better match (bigger
// reward for consecutive characters and for the match starting early).
function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastMatchIndex = -1;
  let firstMatchIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (firstMatchIndex === -1) firstMatchIndex = ti;
      score += lastMatchIndex === ti - 1 ? 3 : 1; // consecutive matches score higher
      lastMatchIndex = ti;
      qi++;
    }
  }
  if (qi < q.length) return null; // not every query character was found in order

  score += Math.max(0, 8 - firstMatchIndex); // earlier match start scores higher
  return score;
}

// Powers the search bar's predictive dropdown - a fast, small lookup
// distinct from the full filtered grid. Scoped to an optional weaponId so
// the loadout picker's dropdown only suggests skins valid for the slot it's
// open on. The catalog is small enough (~1365 real skins, usually far fewer
// once weapon-scoped) that fetching the candidate set and fuzzy-ranking in
// JS is simpler and just as fast as anything fancier at this scale.
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
