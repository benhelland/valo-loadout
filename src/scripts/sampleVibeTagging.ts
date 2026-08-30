// ONE-OFF SAMPLE RUN (delete after use, not part of the app). Runs the real,
// live vibe-tagging call - importing the actual prompt/schema from
// src/lib/vibeTagging.ts, not a duplicate - against a small, deliberately
// diverse set of real skins, and prints both the resulting tags AND the
// actual response.usage token counts, so cost is measured, not estimated.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CLASSIFY_PROMPT, VibeTagsSchema } from "@/lib/vibeTagging";
import { prisma } from "@/lib/db";

// Diverse on purpose - one skin per aesthetic cluster identified when the
// vocabulary was designed, so a bad prompt shows up as a bad tag on an
// obvious case, not just noise. Minima/Recon pair specifically re-checks the
// tactical-vs-minimal boundary that took three rounds to fix.
const SAMPLE_NAME_HINTS = [
  "Reaver",
  "Prime",
  "Bubble Pop",
  "Recon",
  "Araxys",
  "Sovereign",
  "Ayakashi",
  "Glitchpop",
  "Elderflame",
  "Minima",
];

async function main() {
  const client = new Anthropic();
  let totalInput = 0;
  let totalOutput = 0;
  let done = 0;

  for (const hint of SAMPLE_NAME_HINTS) {
    const skin = await prisma.skin.findFirst({
      where: { displayName: { contains: hint, mode: "insensitive" }, displayIconUrl: { not: null } },
      select: { displayName: true, displayIconUrl: true },
      orderBy: { displayName: "asc" },
    });
    if (!skin?.displayIconUrl) {
      console.log(`No match / no image for "${hint}"`);
      continue;
    }

    const response = await client.messages.parse({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: skin.displayIconUrl } },
            { type: "text", text: CLASSIFY_PROMPT },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(VibeTagsSchema) },
    });

    const tags = response.parsed_output?.tags ?? [];
    const { input_tokens, output_tokens } = response.usage;
    totalInput += input_tokens;
    totalOutput += output_tokens;
    done++;

    console.log(`${skin.displayName}: [${tags.join(", ")}]  (in=${input_tokens}, out=${output_tokens})`);
  }

  const avgInput = totalInput / done;
  const avgOutput = totalOutput / done;
  const costPerSkin = (avgInput / 1_000_000) * 1.0 + (avgOutput / 1_000_000) * 5.0;

  console.log(`\n${done} calls. Avg input=${avgInput.toFixed(0)} tokens, avg output=${avgOutput.toFixed(0)} tokens.`);
  console.log(`Cost per skin: $${costPerSkin.toFixed(6)}`);
  console.log(`Projected for 1365 skins: $${(costPerSkin * 1365).toFixed(2)}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
