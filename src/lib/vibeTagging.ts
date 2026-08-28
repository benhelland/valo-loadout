import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// Fixed vocabulary - not freeform, so gallery filters stay consistent.
// See docs/ARCHITECTURE.md "Color and vibe tagging pipeline".
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
] as const;

const VibeTagsSchema = z.object({
  tags: z
    .array(z.enum(VIBE_TAGS))
    .describe("1-4 vibe tags that best describe this weapon skin's aesthetic, most fitting first."),
});

let client: Anthropic | undefined;
function getClient() {
  client ??= new Anthropic();
  return client;
}

// Best-effort classification, not ground truth - ingest-time only, never
// re-run on unchanged items. Returns null on failure so one bad image
// doesn't fail the whole sync job.
export async function tagSkinVibe(imageUrl: string): Promise<string[] | null> {
  try {
    const response = await getClient().messages.parse({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            { type: "text", text: "Classify this VALORANT weapon skin's visual vibe." },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(VibeTagsSchema) },
    });

    return response.parsed_output?.tags ?? null;
  } catch (err) {
    console.warn(`Vibe tagging failed for ${imageUrl}:`, (err as Error).message);
    return null;
  }
}
