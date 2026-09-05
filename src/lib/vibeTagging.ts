import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { Jimp } from "jimp";

// Fixed vocabulary - not freeform, so gallery filters stay consistent.
// See docs/ARCHITECTURE.md "Color and vibe tagging".
export const VIBE_TAGS = [
  "dark",
  "sleek",
  "futuristic",
  "elegant",
  "aggressive",
  "cute",
  "retro",
  "neon",
  "anime",
  "nature",
  "gold",
  "minimal",
  "tactical",
  "cosmic",
] as const;

// Exported so one-off sample/eval scripts (see src/scripts/) can test the
// exact real prompt/schema instead of a hand-copied duplicate that risks
// drifting out of sync with what actually runs at sync time.
export const VibeTagsSchema = z.object({
  tags: z
    .array(z.enum(VIBE_TAGS))
    .describe("1-4 vibe tags that best describe this weapon skin's aesthetic, most fitting first."),
});

// A short definition per tag, not just the bare word - each of the ~1365
// calls this runs against is an independent request with no memory of any
// other, so nothing enforces one call's idea of "sleek" matching another's
// unless the prompt pins it down itself. Cheap insurance (~130 extra input
// tokens/call, ~$0.18 total across the catalog) against a vocabulary that
// was deliberately designed to have adjacent-but-distinct meanings (sleek vs.
// minimal, dark vs. tactical, elegant vs. gold) collapsing into interchangeable
// guesses.
const VIBE_TAG_GLOSSARY: Record<(typeof VIBE_TAGS)[number], string> = {
  dark: "black/shadowy, moody",
  sleek: "smooth glossy modern finish",
  futuristic: "sci-fi tech/mechanical",
  elegant: "refined, ornate, ceremonial",
  aggressive: "spiky, monstrous, menacing",
  cute: "playful, cartoonish, novelty",
  retro: "80s/90s throwback, pixel/arcade",
  neon: "glowing cyberpunk colors",
  anime: "Japanese animation style",
  nature: "organic, floral, animal",
  gold: "metallic gold/luxury finish",
  minimal: "plain, understated, few details - including a flat single-color gun with no pattern, even if its silhouette looks like a real firearm",
  // Tightened three times after live sample runs
  // (src/scripts/sampleVibeTagging.ts). A wording-only fix never stuck:
  // Minima Ares (uniform matte black, zero pattern, zero attachments) kept
  // getting "tactical" no matter how the definition's own text excluded it -
  // the model appears to weight "this silhouette resembles a real rifle" over
  // a same-sentence exclusion clause. Restructuring the whole prompt from one
  // dense comma-joined sentence to a bulleted list (this line) is what
  // finally separated them cleanly - a plain black rifle *shape* alone is
  // "minimal" now, "tactical" requires an actual pattern or visible gear.
  tactical: "camo pattern, tan/olive drab paint, or visible mil-spec gear (rails, optics, tape, stencils) actually painted/attached onto the gun - shape alone doesn't count",
  cosmic: "space, starfield, celestial",
};

export const CLASSIFY_PROMPT = `Classify this VALORANT weapon skin's visual vibe. Pick 1-4 tags that clearly apply, most fitting first - don't force a tag just because nothing else fits, and a single tag is fine.

${VIBE_TAGS.map((tag) => `- ${tag}: ${VIBE_TAG_GLOSSARY[tag]}`).join("\n")}`;

let client: Anthropic | undefined;
function getClient() {
  client ??= new Anthropic();
  return client;
}

type ImageSource = { type: "url"; url: string } | { type: "base64"; media_type: "image/png"; data: string };

async function classify(source: ImageSource) {
  const response = await getClient().messages.parse({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source },
          { type: "text", text: CLASSIFY_PROMPT },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(VibeTagsSchema) },
  });
  return response.parsed_output?.tags ?? null;
}

// Confirmed against real data (5 skins in the "Hi-DR0" collection): every
// other skin's render is ~512px wide, but valorant-api.com serves these at
// 8192px - over Anthropic's 8000px per-dimension hard cap, so the plain URL
// request 400s every time (not transient - retrying the same URL fails
// identically). Downscaling client-side and sending as base64 instead of a
// URL fixes it. 1568 matches Anthropic's own documented sweet spot for
// image tokenization, so this isn't just "small enough to pass" - it's the
// size Claude would effectively downscale to internally anyway.
const MAX_DIMENSION_FALLBACK = 1568;

async function classifyDownscaled(imageUrl: string): Promise<string[] | null> {
  const res = await fetch(imageUrl);
  const buf = Buffer.from(await res.arrayBuffer());
  const img = await Jimp.read(buf);
  if (img.bitmap.width > MAX_DIMENSION_FALLBACK || img.bitmap.height > MAX_DIMENSION_FALLBACK) {
    img.resize({ w: Math.min(img.bitmap.width, MAX_DIMENSION_FALLBACK), h: Math.min(img.bitmap.height, MAX_DIMENSION_FALLBACK) });
  }
  const data = (await img.getBuffer("image/png")).toString("base64");
  return classify({ type: "base64", media_type: "image/png", data });
}

// Best-effort classification, not ground truth - ingest-time only, never
// re-run on unchanged items. Returns null on failure so one bad image
// doesn't fail the whole sync job.
export async function tagSkinVibe(imageUrl: string): Promise<string[] | null> {
  try {
    return await classify({ type: "url", url: imageUrl });
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes("image dimensions exceed max allowed size")) {
      try {
        return await classifyDownscaled(imageUrl);
      } catch (fallbackErr) {
        console.warn(`Vibe tagging (downscale fallback) failed for ${imageUrl}:`, (fallbackErr as Error).message);
        return null;
      }
    }
    console.warn(`Vibe tagging failed for ${imageUrl}:`, message);
    return null;
  }
}
