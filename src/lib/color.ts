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
