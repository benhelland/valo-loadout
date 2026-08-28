import { prisma } from "@/lib/db";
import { valorantApi, stripEnumPrefix } from "@/lib/valorant-api";
import { runBatched } from "@/lib/batch";

export async function syncWeaponsAndSkins() {
  const weapons = await valorantApi.getWeapons();
  let skinCount = 0;

  for (const weapon of weapons) {
    await prisma.weapon.upsert({
      where: { id: weapon.uuid },
      create: {
        id: weapon.uuid,
        displayName: weapon.displayName,
        category: stripEnumPrefix(weapon.category),
        displayIconUrl: weapon.displayIcon,
      },
      update: {
        displayName: weapon.displayName,
        category: stripEnumPrefix(weapon.category),
        displayIconUrl: weapon.displayIcon,
      },
    });

    await runBatched(weapon.skins, 10, async (skin) => {
      await prisma.skin.upsert({
        where: { id: skin.uuid },
        create: {
          id: skin.uuid,
          weaponId: weapon.uuid,
          displayName: skin.displayName,
          contentTierId: skin.contentTierUuid,
          themeId: skin.themeUuid,
          displayIconUrl: skin.displayIcon,
          // firstSeenInSyncAt defaults to now() - only set here, on first insert.
        },
        update: {
          weaponId: weapon.uuid,
          displayName: skin.displayName,
          contentTierId: skin.contentTierUuid,
          themeId: skin.themeUuid,
          displayIconUrl: skin.displayIcon,
          // firstSeenInSyncAt intentionally omitted - never touched on update.
        },
      });

      await Promise.all(
        skin.levels.map((level, i) =>
          prisma.skinLevel.upsert({
            where: { id: level.uuid },
            create: {
              id: level.uuid,
              skinId: skin.uuid,
              levelIndex: i + 1,
              displayIconUrl: level.displayIcon,
              videoUrl: level.streamedVideo,
              levelItem: stripEnumPrefix(level.levelItem),
            },
            update: {
              levelIndex: i + 1,
              displayIconUrl: level.displayIcon,
              videoUrl: level.streamedVideo,
              levelItem: stripEnumPrefix(level.levelItem),
            },
          }),
        ),
      );

      await Promise.all(
        skin.chromas.map((chroma) =>
          prisma.skinChroma.upsert({
            where: { id: chroma.uuid },
            create: {
              id: chroma.uuid,
              skinId: skin.uuid,
              displayIconUrl: chroma.displayIcon,
              fullRenderUrl: chroma.fullRender,
              swatchUrl: chroma.swatch,
              videoUrl: chroma.streamedVideo,
            },
            update: {
              displayIconUrl: chroma.displayIcon,
              fullRenderUrl: chroma.fullRender,
              swatchUrl: chroma.swatch,
              videoUrl: chroma.streamedVideo,
            },
          }),
        ),
      );

      skinCount++;
    });
  }

  console.log(`Synced ${weapons.length} weapons, ${skinCount} skins`);
  return { weapons: weapons.length, skins: skinCount };
}
