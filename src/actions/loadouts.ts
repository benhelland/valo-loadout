"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { MAX_LOADOUTS_PER_USER, normalizeName } from "@/lib/limits";

// Create paths return a result rather than throwing. Next.js redacts a thrown
// Server Action error's message in production, so a throw would reach the user
// as an opaque "something went wrong" - useless for a limit, whose entire
// value is telling them which limit and what to do about it.
export type CreateLoadoutResult = { ok: true; id: string } | { ok: false; message: string };

// Checked before every create path. Counting on each create is one extra
// indexed count against a table already indexed by userId - cheap next to the
// alternative of a user discovering the create button has no floor.
async function hasLoadoutHeadroom(userId: string): Promise<boolean> {
  const count = await prisma.loadout.count({ where: { userId } });
  return count < MAX_LOADOUTS_PER_USER;
}

const LOADOUT_LIMIT_MESSAGE = `You've reached the limit of ${MAX_LOADOUTS_PER_USER} loadouts. Delete one to make room.`;

async function requireOwnership(loadoutId: string, userId: string) {
  const loadout = await prisma.loadout.findUnique({ where: { id: loadoutId }, select: { userId: true } });
  if (!loadout || loadout.userId !== userId) throw new Error("Loadout not found");
}

// Share slugs are unguessable and deliberately separate from the loadout's
// internal id - exposing the id would mean the only way to revoke a link is
// to delete the loadout. 16 random bytes of base64url; regenerating one
// silently kills every previously shared link, which is the whole point.
function generateShareSlug(): string {
  return randomBytes(16).toString("base64url");
}

// Opt-in per loadout, per docs/ARCHITECTURE.md - loadouts are private by
// default and never become publicly viewable just by existing.
export async function enableLoadoutSharing(loadoutId: string): Promise<string> {
  const userId = await getCurrentUserId();
  await requireOwnership(loadoutId, userId);

  const existing = await prisma.loadout.findUnique({
    where: { id: loadoutId },
    select: { isShareable: true, shareSlug: true },
  });
  // Already shared - hand back the same link rather than churning the slug
  // and breaking links the user may have already sent out.
  if (existing?.isShareable && existing.shareSlug) return existing.shareSlug;

  const shareSlug = generateShareSlug();
  await prisma.loadout.update({ where: { id: loadoutId }, data: { isShareable: true, shareSlug } });
  revalidatePath(`/loadouts/${loadoutId}`);
  revalidatePath("/loadouts");
  return shareSlug;
}

export async function disableLoadoutSharing(loadoutId: string): Promise<void> {
  const userId = await getCurrentUserId();
  await requireOwnership(loadoutId, userId);
  // Clearing the slug (not just the flag) is what actually revokes any link
  // already in the wild.
  await prisma.loadout.update({
    where: { id: loadoutId },
    data: { isShareable: false, shareSlug: null },
  });
  revalidatePath(`/loadouts/${loadoutId}`);
  revalidatePath("/loadouts");
}

export async function createLoadout(name: string): Promise<CreateLoadoutResult> {
  const userId = await getCurrentUserId();
  if (!(await hasLoadoutHeadroom(userId))) return { ok: false, message: LOADOUT_LIMIT_MESSAGE };
  const loadout = await prisma.loadout.create({
    data: { userId, name: normalizeName(name, "New Loadout") },
  });
  revalidatePath("/loadouts");
  return { ok: true, id: loadout.id };
}

export async function renameLoadout(loadoutId: string, name: string): Promise<void> {
  const userId = await getCurrentUserId();
  await requireOwnership(loadoutId, userId);
  await prisma.loadout.update({ where: { id: loadoutId }, data: { name: normalizeName(name, "Untitled") } });
  revalidatePath("/loadouts");
  revalidatePath(`/loadouts/${loadoutId}`);
}

export async function deleteLoadout(loadoutId: string): Promise<void> {
  const userId = await getCurrentUserId();
  await requireOwnership(loadoutId, userId);
  await prisma.loadout.delete({ where: { id: loadoutId } }); // cascades to loadout_items
  revalidatePath("/loadouts");
}

export async function duplicateLoadout(loadoutId: string): Promise<CreateLoadoutResult> {
  const userId = await getCurrentUserId();
  const original = await prisma.loadout.findUnique({
    where: { id: loadoutId },
    select: {
      userId: true,
      name: true,
      items: { select: { weaponId: true, skinId: true, levelId: true, chromaId: true, buddyId: true } },
    },
  });
  if (!original || original.userId !== userId) throw new Error("Loadout not found");
  // Duplicating is a create too - without this the cap is trivially bypassed
  // by copying an existing loadout instead of pressing "new".
  if (!(await hasLoadoutHeadroom(userId))) return { ok: false, message: LOADOUT_LIMIT_MESSAGE };

  const copy = await prisma.loadout.create({
    data: {
      userId,
      name: normalizeName(`${original.name} (copy)`, "New Loadout"),
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
  return { ok: true, id: copy.id };
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
