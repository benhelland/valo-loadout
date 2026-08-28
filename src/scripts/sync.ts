import { syncContentTiers, syncThemes, syncBuddies } from "@/sync/syncReferenceData";
import { syncWeaponsAndSkins } from "@/sync/syncSkins";
import { prisma } from "@/lib/db";

async function main() {
  console.log("Starting content sync from valorant-api.com...");
  // Order matters: content tiers and themes must exist before skins reference them.
  await syncContentTiers();
  await syncThemes();
  await syncBuddies();
  await syncWeaponsAndSkins();
  console.log("Sync complete.");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
