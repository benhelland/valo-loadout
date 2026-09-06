import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { getLoadout } from "@/queries/loadouts";
import { getSkinDetail, getBuddy } from "@/queries/gallery";
import { SkinDetailView } from "@/components/gallery/SkinDetailView";

// Reuses the same skin-detail UI as the main gallery, just with an extra
// "Add to Loadout" action wired in via loadoutContext - see
// src/components/gallery/SkinPreview.tsx.
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoadoutAssignSkinPage({
  params,
  searchParams,
}: PageProps<"/loadouts/[id]/weapon/[weaponId]/skins/[skinId]">) {
  const { id, weaponId, skinId } = await params;
  const sp = await searchParams;
  const userId = await getCurrentUserId();

  const [loadout, skin, buddy] = await Promise.all([getLoadout(id, userId), getSkinDetail(skinId), getBuddy(first(sp.buddyId))]);

  if (!loadout) notFound();
  if (!skin) notFound();
  if (skin.weaponId !== weaponId) notFound();

  // If this weapon slot already has this exact skin assigned, pre-select
  // whatever level/chroma/buddy was previously chosen instead of resetting
  // to defaults - re-opening a slot to just tweak the buddy shouldn't lose
  // the level/chroma you'd already picked.
  const existingItem = loadout.items.find((item) => item.weaponId === weaponId);
  const preserved = existingItem?.skinId === skinId ? existingItem : null;

  // URL params win over the saved item: they're only present when returning
  // from the buddy gallery's pick mode, carrying the in-progress selection
  // (which may differ from what's saved, and includes the buddy just picked).
  return (
    <SkinDetailView
      skin={skin}
      buddy={buddy}
      initialLevelId={first(sp.levelId) ?? preserved?.levelId}
      initialChromaId={first(sp.chromaId) ?? preserved?.chromaId}
      initialBuddyId={first(sp.buddyId) ?? preserved?.buddyId}
      loadoutContext={{ loadoutId: id, weaponId, loadoutName: loadout.name }}
      backHref={`/loadouts/${id}/weapon/${weaponId}`}
      backLabel="← Back to picker"
    />
  );
}
