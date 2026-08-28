// valorant-api.com's contenttiers.highlightColor is 8 hex chars: RRGGBBAA.
export function tierColorToCss(highlightColor: string | null | undefined): string | undefined {
  if (!highlightColor || highlightColor.length < 8) return undefined;
  const r = parseInt(highlightColor.slice(0, 2), 16);
  const g = parseInt(highlightColor.slice(2, 4), 16);
  const b = parseInt(highlightColor.slice(4, 6), 16);
  const a = parseInt(highlightColor.slice(6, 8), 16) / 255;
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}
