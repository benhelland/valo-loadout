// Single source of truth for the color-family vocabulary extractColorFamily()
// (src/lib/color.ts) assigns. Split into its own file, with no imports, so
// client components (the filter bar) can use COLOR_FAMILIES for building
// filter UI without pulling in color.ts's node-vibrant dependency, which is
// server/Node-only and breaks the client bundle.
export const HUE_FAMILY_DEGREES: Record<string, number> = {
  red: 0,
  orange: 30,
  gold: 50,
  green: 120,
  cyan: 185,
  blue: 225,
  purple: 270,
  pink: 320,
};

export const COLOR_FAMILIES = ["black", "white", "gray", "multicolor", ...Object.keys(HUE_FAMILY_DEGREES)];
