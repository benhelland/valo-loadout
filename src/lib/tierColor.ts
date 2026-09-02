// valorant-api.com's contenttiers.highlightColor is 8 hex chars: RRGGBBAA.
//
// Every real tier ships with an alpha of `33` (=0.2), which is right for a
// large wash behind an icon and far too faint for anything meant to be read
// as a *signal* - a 1-2px border tinted at 20% opacity over a dark surface
// is effectively invisible. `alphaOverride` exists so callers that want the
// tier's actual hue (card borders, rarity rails) can ask for it, without
// each one re-parsing the hex itself.
function parseTierColor(highlightColor: string | null | undefined) {
  if (!highlightColor || highlightColor.length < 8) return null;
  return {
    r: parseInt(highlightColor.slice(0, 2), 16),
    g: parseInt(highlightColor.slice(2, 4), 16),
    b: parseInt(highlightColor.slice(4, 6), 16),
    a: parseInt(highlightColor.slice(6, 8), 16) / 255,
  };
}

export function tierColorToCss(
  highlightColor: string | null | undefined,
  alphaOverride?: number,
): string | undefined {
  const parsed = parseTierColor(highlightColor);
  if (!parsed) return undefined;
  const alpha = alphaOverride ?? parsed.a;
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${alpha.toFixed(2)})`;
}
