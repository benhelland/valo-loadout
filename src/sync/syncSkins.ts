import { prisma } from "@/lib/db";
import { valorantApi, stripEnumPrefix } from "@/lib/valorant-api";
import { runBatched } from "@/lib/batch";
import { extractColorFamily } from "@/lib/color";
import { tagSkinVibe } from "@/lib/vibeTagging";

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
      const skinRow = await prisma.skin.upsert({
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

      // Color extraction only runs for skins that don't have one yet - not
      // re-run on unchanged items (see docs/ARCHITECTURE.md).
      if (skinRow.colorFamily === null && skinRow.displayIconUrl) {
        const colorFamily = await extractColorFamily(skinRow.displayIconUrl);
        if (colorFamily) {
          await prisma.skin.update({ where: { id: skinRow.id }, data: { colorFamily } });
        }
      }

      // Vibe tagging: ingest-time only, never re-run once a skin has tags.
      if (skinRow.displayIconUrl) {
        const existingTagCount = await prisma.skinVibeTag.count({ where: { skinId: skinRow.id } });
        if (existingTagCount === 0) {
          const tags = await tagSkinVibe(skinRow.displayIconUrl);
          if (tags && tags.length > 0) {
            await prisma.skinVibeTag.createMany({
              data: tags.map((tag) => ({ skinId: skinRow.id, tag })),
              skipDuplicates: true,
            });
          }
        }
      }

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
        skin.chromas.map(async (chroma) => {
          const chromaRow = await prisma.skinChroma.upsert({
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
          });

          if (chromaRow.colorFamily === null) {
            // Fall back through swatch -> fullRender -> displayIcon, since
            // swatch is frequently null on the default chroma variant.
            const imageUrl = chromaRow.swatchUrl ?? chromaRow.fullRenderUrl ?? chromaRow.displayIconUrl;
            if (imageUrl) {
              const colorFamily = await extractColorFamily(imageUrl);
              if (colorFamily) {
                await prisma.skinChroma.update({ where: { id: chromaRow.id }, data: { colorFamily } });
              }
            }
          }
        }),
      );

      skinCount++;
    });
  }

  console.log(`Synced ${weapons.length} weapons, ${skinCount} skins`);
  return { weapons: weapons.length, skins: skinCount };
}
