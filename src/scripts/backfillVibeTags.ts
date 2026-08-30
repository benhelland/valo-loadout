// ONE-OFF BACKFILL (delete after use, not part of the app). Tags every real
// skin that doesn't have vibe tags yet, using the real tagSkinVibe pipeline
// (src/lib/vibeTagging.ts) - same prompt/schema/model validated in
// src/scripts/sampleVibeTagging.ts.
//
// Safe to interrupt and re-run: only ever queries skins with zero vibe tags
// (the same ingest-time-only rule syncSkins.ts enforces per-skin, expressed
// here as one upfront query), so a partial run never re-spends on a skin
// that already got tagged, and never duplicates/overwrites existing tags.
// Each skin's tag-and-write is wrapped in its own try/catch so one bad image
// or one transient DB error can't take the rest of the batch down with it -
// without that, a single throw inside runBatched's Promise.all would reject
// everything still in flight, silently leaving whatever was mid-request
// permanently untagged with no record of why.
import { tagSkinVibe } from "@/lib/vibeTagging";
import { runBatched } from "@/lib/batch";
import { prisma } from "@/lib/db";

type Candidate = { id: string; displayName: string; displayIconUrl: string };

async function tagOne(skin: Candidate): Promise<boolean> {
  try {
    const tags = await tagSkinVibe(skin.displayIconUrl);
    if (!tags || tags.length === 0) return false;
    await prisma.skinVibeTag.createMany({
      data: tags.map((tag) => ({ skinId: skin.id, tag })),
      skipDuplicates: true,
    });
    return true;
  } catch (err) {
    console.warn(`Unexpected failure tagging ${skin.displayName}: ${(err as Error).message}`);
    return false;
  }
}

async function main() {
  const rows = await prisma.skin.findMany({
    where: { contentTierId: { not: null }, displayIconUrl: { not: null }, vibeTags: { none: {} } },
    select: { id: true, displayName: true, displayIconUrl: true },
    orderBy: { displayName: "asc" },
  });
  // The where clause already guarantees displayIconUrl is non-null - narrow
  // the type to match without an `as`/`!` assertion.
  const candidates: Candidate[] = rows.filter((r): r is Candidate => r.displayIconUrl !== null);

  console.log(`${candidates.length} skins need vibe tags.`);
  if (candidates.length === 0) {
    await prisma.$disconnect();
    return;
  }

  let tagged = 0;
  let failed: Candidate[] = [];
  let done = 0;

  await runBatched(candidates, 10, async (skin) => {
    const ok = await tagOne(skin);
    if (ok) tagged++;
    else failed.push(skin);
    done++;
    if (done % 100 === 0) console.log(`  ${done}/${candidates.length}`);
  });

  console.log(`\nFirst pass: ${tagged}/${candidates.length} tagged, ${failed.length} failed.`);

  if (failed.length > 0) {
    console.log(`Retrying ${failed.length} failures once...`);
    const retryList = failed;
    failed = [];
    let retried = 0;
    await runBatched(retryList, 10, async (skin) => {
      const ok = await tagOne(skin);
      if (ok) {
        tagged++;
        retried++;
      } else {
        failed.push(skin);
      }
    });
    console.log(`Retry recovered ${retried}/${retryList.length}.`);
  }

  console.log(`\nDone. ${tagged}/${candidates.length} tagged.`);
  if (failed.length > 0) {
    console.log(`${failed.length} skins still have no vibe tags after retry - re-run this script later to pick them up:`);
    for (const s of failed) console.log(`  - ${s.displayName} (${s.id})`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
