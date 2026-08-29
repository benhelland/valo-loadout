import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { getLoadout } from "@/queries/loadouts";
import { getSkinDetail, listBuddies } from "@/queries/gallery";
import { SkinDetailView } from "@/components/gallery/SkinDetailView";

// Reuses the same skin-detail UI as the main gallery, just with an extra
// "Add to Loadout" action wired in via loadoutContext - see
// src/components/gallery/SkinPreview.tsx.
export default async function LoadoutAssignSkinPage({
  params,
}: PageProps<"/loadouts/[id]/weapon/[weaponId]/skins/[skinId]">) {
  const { id, weaponId, skinId } = await params;
  const userId = await getCurrentUserId();

  const [loadout, skin, buddies] = await Promise.all([getLoadout(id, userId), getSkinDetail(skinId), listBuddies()]);

  if (!loadout) notFound();
  if (!skin) notFound();
  if (skin.weaponId !== weaponId) notFound();

  // If this weapon slot already has this exact skin assigned, pre-select
  // whatever level/chroma/buddy was previously chosen instead of resetting
  // to defaults - re-opening a slot to just tweak the buddy shouldn't lose
  // the level/chroma you'd already picked.
  const existingItem = loadout.items.find((item) => item.weaponId === weaponId);
  const preserved = existingItem?.skinId === skinId ? existingItem : null;

  return (
    <SkinDetailView
      skin={skin}
      buddies={buddies}
      initialLevelId={preserved?.levelId}
      initialChromaId={preserved?.chromaId}
      initialBuddyId={preserved?.buddyId}
      loadoutContext={{ loadoutId: id, weaponId, loadoutName: loadout.name }}
      backHref={`/loadouts/${id}/weapon/${weaponId}`}
      backLabel="← Back to picker"
    />
  );
}
