import { Vibrant } from "node-vibrant/node";
import type { Palette, Swatch } from "@vibrant/color";
import { HUE_FAMILY_DEGREES } from "@/lib/colorFamilies";

// Best-effort dominant-color bucketing for gallery filtering - not ground
// truth. See docs/ARCHITECTURE.md "Color and vibe tagging pipeline".

const HUE_FAMILIES: { name: string; hue: number }[] = Object.entries(HUE_FAMILY_DEGREES).map(([name, hue]) => ({ name, hue }));

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function classifyHsl([h, s, l]: [number, number, number]): string {
  const hueDeg = h * 360;
  const satPct = s * 100;
  const lightPct = l * 100;

  if (lightPct < 15) return "black";
  if (lightPct > 92 && satPct < 15) return "white";
  if (satPct < 12) return "gray";

  let best = HUE_FAMILIES[0];
  let bestDist = Infinity;
  for (const family of HUE_FAMILIES) {
    const dist = hueDistance(hueDeg, family.hue);
    if (dist < bestDist) {
      best = family;
      bestDist = dist;
    }
  }
  return best.name;
}

const SWATCH_PRIORITY = ["Vibrant", "DarkVibrant", "LightVibrant", "Muted", "DarkMuted", "LightMuted"] as const;

function extractFamilyFromPalette(palette: Palette): string | null {
  const swatches = SWATCH_PRIORITY.map((key) => palette[key]).filter((s): s is Swatch => s !== null);
  if (swatches.length === 0) return null;

  const families = new Set(swatches.map((s) => classifyHsl(s.hsl)));
  const distinctHueFamilies = [...families].filter((f) => f !== "black" && f !== "white" && f !== "gray");
  if (distinctHueFamilies.length >= 3) return "multicolor";

  return classifyHsl(swatches[0].hsl);
}

// Returns null on failure (unreachable image, decode error, etc.) rather than
// throwing - a missing color family shouldn't fail the whole sync job.
export async function extractColorFamily(imageUrl: string): Promise<string | null> {
  try {
    const palette = await Vibrant.from(imageUrl).getPalette();
    return extractFamilyFromPalette(palette);
  } catch (err) {
    console.warn(`Color extraction failed for ${imageUrl}:`, (err as Error).message);
    return null;
  }
}

// Every buddy icon hangs from the same rendered keychain clasp - a brass
// ring/clip that isn't part of any charm's actual design. It confused the
// plain vibrancy-priority extraction above badly: measured empirically
// (src/scripts/analyzeClaspColor.ts, sampling 150 buddies' raw Vibrant
// palettes) a swatch with hue in [15,55] deg (brass/gold/bronze) and
// lightness in [10,75]% turns up as a top-6 swatch on up to 49% of ALL
// buddies regardless of the charm's real color, but consistently at tiny
// population - a handful of pixels out of a ~20-30 total palette population,
// because the clasp is a thin, small, mostly-hidden element. A charm that is
// genuinely gold/brass/bronze colored instead DOMINATES its palette (that
// hue is most of the image, not a sliver of it). That population gap is a
// reliable, measured signal - not a guess - so: try classifying from only
// the swatches outside that band, and only fall back to including it if
// nothing else has a meaningful share of the image (i.e. the charm really is
// that color). Confirmed the clasp is NOT a fixed screen position first
// (src/scripts/analyzeClasp.ts - only 0.1% of pixels are position-stable
// across icons), which is why this is a color-signature exclusion rather
// than a crop.
function isClaspHardwareHsl([h, , l]: [number, number, number]): boolean {
  const hueDeg = h * 360;
  const lightPct = l * 100;
  return hueDeg >= 15 && hueDeg <= 55 && lightPct >= 10 && lightPct <= 75;
}

// Deciding "is this swatch the clasp or a genuinely gold/brass charm" can't
// be done from hue alone - both look the same color. What settles it is
// whether some OTHER, differently-colored swatch has a real (non-noise)
// share of the image: if so, that's the charm and the hardware-band swatch
// is almost certainly just the clasp riding along. Only trust a hardware-band
// swatch when nothing else in the palette has a meaningful presence - i.e.
// the charm plausibly really is that color. Measured against several
// candidate rules (see src/scripts/validateBuddyColor.ts) - a flat
// population-share dominance test on the hardware band itself scored worse:
// the clasp's color routinely gets split across 3-4 of Vibrant's six swatch
// slots (Vibrant/DarkVibrant/LightVibrant/Muted all separately land in the
// brass hue band), so its swatches can out-total a charm's single real
// swatch by sheer count even when the clasp is visually tiny.
const MEANINGFUL_POPULATION_SHARE = 0.12;

function extractBuddyFamilyFromPalette(palette: Palette): string | null {
  const allSwatches = SWATCH_PRIORITY.map((key) => palette[key]).filter((s): s is Swatch => s !== null && s.population > 0);
  if (allSwatches.length === 0) return null;

  const totalPopulation = allSwatches.reduce((sum, s) => sum + s.population, 0);
  const nonHardware = allSwatches.filter((s) => !isClaspHardwareHsl(s.hsl));
  const bestNonHardware = nonHardware.length > 0 ? nonHardware.reduce((a, b) => (b.population > a.population ? b : a)) : null;

  const candidates =
    bestNonHardware && bestNonHardware.population / totalPopulation >= MEANINGFUL_POPULATION_SHARE ? nonHardware : allSwatches;

  const best = candidates.reduce((a, b) => (b.population > a.population ? b : a));

  const families = new Set(candidates.map((s) => classifyHsl(s.hsl)));
  const distinctHueFamilies = [...families].filter((f) => f !== "black" && f !== "white" && f !== "gray");
  if (distinctHueFamilies.length >= 3) return "multicolor";

  return classifyHsl(best.hsl);
}

export async function extractBuddyColorFamily(imageUrl: string): Promise<string | null> {
  try {
    const palette = await Vibrant.from(imageUrl).getPalette();
    return extractBuddyFamilyFromPalette(palette);
  } catch (err) {
    console.warn(`Color extraction failed for ${imageUrl}:`, (err as Error).message);
    return null;
  }
}

