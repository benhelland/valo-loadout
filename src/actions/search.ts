"use server";

import { prisma } from "@/lib/db";

export interface SkinSuggestion {
  id: string;
  displayName: string;
  displayIconUrl: string | null;
  weaponName: string | null;
}

// Powers the search bar's predictive dropdown - a fast, small lookup
// distinct from the full filtered grid (which the same query text also
// drives, via a debounced URL update - see SearchAutocomplete.tsx). Scoped
// to an optional weaponId so the loadout picker's dropdown only suggests
// skins valid for the slot it's open on.
export async function searchSkinsAutocomplete(query: string, weaponId?: string): Promise<SkinSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const skins = await prisma.skin.findMany({
    where: {
      contentTierId: { not: null }, // same non-skin exclusion as the main gallery listing
      displayName: { contains: trimmed, mode: "insensitive" },
      ...(weaponId ? { weaponId } : {}),
    },
    orderBy: { displayName: "asc" },
    take: 8,
    select: { id: true, displayName: true, displayIconUrl: true, weapon: { select: { displayName: true } } },
  });

  return skins.map((s) => ({
    id: s.id,
    displayName: s.displayName,
    displayIconUrl: s.displayIconUrl,
    weaponName: s.weapon?.displayName ?? null,
  }));
}
