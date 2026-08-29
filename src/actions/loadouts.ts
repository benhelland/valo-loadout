"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

async function requireOwnership(loadoutId: string, userId: string) {
  const loadout = await prisma.loadout.findUnique({ where: { id: loadoutId }, select: { userId: true } });
  if (!loadout || loadout.userId !== userId) throw new Error("Loadout not found");
}

export async function createLoadout(name: string): Promise<string> {
  const userId = await getCurrentUserId();
  const loadout = await prisma.loadout.create({
    data: { userId, name: name.trim() || "New Loadout" },
  });
  revalidatePath("/loadouts");
  return loadout.id;
}

export async function renameLoadout(loadoutId: string, name: string): Promise<void> {
  const userId = await getCurrentUserId();
  await requireOwnership(loadoutId, userId);
  await prisma.loadout.update({ where: { id: loadoutId }, data: { name: name.trim() || "Untitled" } });
  revalidatePath("/loadouts");
  revalidatePath(`/loadouts/${loadoutId}`);
}

export async function deleteLoadout(loadoutId: string): Promise<void> {
  const userId = await getCurrentUserId();
  await requireOwnership(loadoutId, userId);
  await prisma.loadout.delete({ where: { id: loadoutId } }); // cascades to loadout_items
  revalidatePath("/loadouts");
}

export async function duplicateLoadout(loadoutId: string): Promise<string> {
  const userId = await getCurrentUserId();
  const original = await prisma.loadout.findUnique({ where: { id: loadoutId }, include: { items: true } });
  if (!original || original.userId !== userId) throw new Error("Loadout not found");

  const copy = await prisma.loadout.create({
    data: {
      userId,
      name: `${original.name} (copy)`,
      items: {
        create: original.items.map((item) => ({
          weaponId: item.weaponId,
          skinId: item.skinId,
          levelId: item.levelId,
          chromaId: item.chromaId,
          buddyId: item.buddyId,
        })),
      },
    },
  });
  revalidatePath("/loadouts");
  return copy.id;
}

export interface SetLoadoutItemInput {
  loadoutId: string;
  weaponId: string;
  skinId: string;
  levelId: string | null;
  chromaId: string | null;
  buddyId: string | null;
}

export async function setLoadoutItem(input: SetLoadoutItemInput): Promise<void> {
  const userId = await getCurrentUserId();
  await requireOwnership(input.loadoutId, userId);

  await prisma.loadoutItem.upsert({
    where: { loadoutId_weaponId: { loadoutId: input.loadoutId, weaponId: input.weaponId } },
    create: input,
    update: {
      skinId: input.skinId,
      levelId: input.levelId,
      chromaId: input.chromaId,
      buddyId: input.buddyId,
    },
  });
  revalidatePath(`/loadouts/${input.loadoutId}`);
}

export async function clearLoadoutItem(loadoutId: string, weaponId: string): Promise<void> {
  const userId = await getCurrentUserId();
  await requireOwnership(loadoutId, userId);
  await prisma.loadoutItem.deleteMany({ where: { loadoutId, weaponId } });
  revalidatePath(`/loadouts/${loadoutId}`);
}
