// Picks the image for a loadout item, honouring the chroma the user chose.
//
// A loadout item stores three things that can each carry their own art: the
// skin, the level, and the chroma (the colour variant). The chroma is the most
// specific and the most visible - "Variant 2 Red" is a different colour gun,
// not a detail - so it wins wherever it exists.
//
// Every surface that draws a loadout item must go through here. Reaching for
// `item.skin.displayIconUrl` directly is always wrong: it silently discards the
// variant the user chose and draws the base colourway instead.
//
// The order below prefers the most specific art available. Not every step is
// reachable with today's data - `skin_chromas.fullRenderUrl` has no nulls - but
// the later steps do carry real cases: some skins have no `displayIconUrl` of
// their own, and a slot with no item at all falls through to the weapon
// outline the caller draws instead.

interface ChromaLike {
  fullRenderUrl?: string | null;
  displayIconUrl?: string | null;
}

interface LevelLike {
  displayIconUrl?: string | null;
}

interface SkinLike {
  displayIconUrl?: string | null;
}

export interface LoadoutItemLike {
  skin: SkinLike;
  level?: LevelLike | null;
  chroma?: ChromaLike | null;
}

/**
 * The image for a filled loadout slot, or null when nothing usable exists.
 *
 * `fullRenderUrl` is preferred over `displayIconUrl` for a chroma because it is
 * the full-size render of that variant; the icon is a smaller crop and is the
 * field more often null.
 */
export function loadoutItemImageUrl(item: LoadoutItemLike | null | undefined): string | null {
  if (!item) return null;
  // `||` rather than `??`: an empty string is not a usable image source, and
  // treating it as one would render a broken image instead of falling through.
  return (
    item.chroma?.fullRenderUrl ||
    item.chroma?.displayIconUrl ||
    item.level?.displayIconUrl ||
    item.skin.displayIconUrl ||
    null
  );
}
