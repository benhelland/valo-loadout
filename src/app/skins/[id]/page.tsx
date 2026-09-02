import { notFound } from "next/navigation";
import { getSkinDetail, listBuddies } from "@/queries/gallery";
import { isSkinWishlisted } from "@/queries/wishlist";
import { listLoadoutSummaries, getLoadoutMembership } from "@/queries/loadouts";
import { getOptionalUserId } from "@/lib/auth";
import { SkinDetailView } from "@/components/gallery/SkinDetailView";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SkinDetailPage({ params, searchParams }: PageProps<"/skins/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const [skin, buddies, userId] = await Promise.all([getSkinDetail(id), listBuddies(), getOptionalUserId()]);

  if (!skin) notFound();

  // Signed-out visitors get neither lookup - the wishlist button falls back
  // to prompting sign-in, and the add-to-loadout control isn't rendered.
  const [isWishlisted, loadouts, membership] = userId
    ? await Promise.all([
        isSkinWishlisted(userId, skin.id),
        listLoadoutSummaries(userId),
        getLoadoutMembership(userId, [skin.id]),
      ])
    : [false, null, new Map<string, string[]>()];

  // Optional preselection, used when returning from the buddy gallery's
  // pick mode: it sends the user back here with buddyId set, and carries
  // the level/chroma they already had so the round trip doesn't reset them.
  return (
    <SkinDetailView
      skin={skin}
      buddies={buddies}
      initialLevelId={first(sp.levelId)}
      initialChromaId={first(sp.chromaId)}
      initialBuddyId={first(sp.buddyId)}
      wishlist={{ isWishlisted, isSignedIn: !!userId }}
      loadouts={loadouts}
      inLoadouts={membership.get(skin.id) ?? []}
    />
  );
}
