// Picks the image for a loadout item, honouring the chroma the user chose.
//
// A loadout item stores three things that can each carry their own art: the
// skin, the level, and the chroma (the colour variant). The chroma is the most
// specific and the most visible - "Variant 2 Red" is a different colour gun,
// not a detail - so it wins wherever it exists. Rendering `skin.displayIconUrl`
// directly ignores the choice entirely and shows the base colourway.
//
// The fallback order below is the same one the gallery card uses, and every
// step of it is load-bearing against real data: a chroma may have only one of
// its two image fields populated, some skins have no `displayIconUrl` of their
// own, and a slot with no item at all falls through to the weapon's outline.

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
  return (
    item.chroma?.fullRenderUrl ??
    item.chroma?.displayIconUrl ??
    item.level?.displayIconUrl ??
    item.skin.displayIconUrl ??
    null
  );
}
