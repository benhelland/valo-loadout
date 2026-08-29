import { prisma } from "@/lib/db";
import { valorantApi } from "@/lib/valorant-api";
import { runBatched } from "@/lib/batch";
import { extractBuddyColorFamily } from "@/lib/color";

export async function syncContentTiers() {
  const tiers = await valorantApi.getContentTiers();
  for (const tier of tiers) {
    await prisma.contentTier.upsert({
      where: { id: tier.uuid },
      create: {
        id: tier.uuid,
        displayName: tier.displayName,
        devName: tier.devName,
        rank: tier.rank,
        highlightColor: tier.highlightColor,
        displayIconUrl: tier.displayIcon,
      },
      update: {
        displayName: tier.displayName,
        devName: tier.devName,
        rank: tier.rank,
        highlightColor: tier.highlightColor,
        displayIconUrl: tier.displayIcon,
      },
    });
  }
  console.log(`Synced ${tiers.length} content tiers`);
  return tiers.length;
}

export async function syncThemes() {
  const themes = await valorantApi.getThemes();
  await runBatched(themes, 10, async (theme) => {
    await prisma.theme.upsert({
      where: { id: theme.uuid },
      create: { id: theme.uuid, displayName: theme.displayName, displayIconUrl: theme.displayIcon },
      update: { displayName: theme.displayName, displayIconUrl: theme.displayIcon },
    });
  });
  console.log(`Synced ${themes.length} themes`);
  return themes.length;
}

export async function syncBuddies() {
  const buddies = await valorantApi.getBuddies();
  await runBatched(buddies, 10, async (buddy) => {
    const buddyRow = await prisma.buddy.upsert({
      where: { id: buddy.uuid },
      create: { id: buddy.uuid, displayName: buddy.displayName, displayIconUrl: buddy.displayIcon },
      update: { displayName: buddy.displayName, displayIconUrl: buddy.displayIcon },
    });

    // Same ingest-time-only rule as skins/chromas: only extract for buddies
    // that don't have a color yet, never re-run on unchanged rows.
    if (buddyRow.colorFamily === null && buddyRow.displayIconUrl) {
      const colorFamily = await extractBuddyColorFamily(buddyRow.displayIconUrl);
      if (colorFamily) {
        await prisma.buddy.update({ where: { id: buddyRow.id }, data: { colorFamily } });
      }
    }

    for (const level of buddy.levels) {
      await prisma.buddyLevel.upsert({
        where: { id: level.uuid },
        create: {
          id: level.uuid,
          buddyId: buddy.uuid,
          charmLevel: level.charmLevel,
          displayIconUrl: level.displayIcon,
        },
        update: { charmLevel: level.charmLevel, displayIconUrl: level.displayIcon },
      });
    }
  });
  console.log(`Synced ${buddies.length} buddies`);
  return buddies.length;
}
