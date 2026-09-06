import { notFound } from "next/navigation";
import { resolveCatalogId } from "@/lib/filterParams";
import { getSkinDetail, getBuddy } from "@/queries/gallery";
import { isSkinWishlisted } from "@/queries/wishlist";
import { listLoadoutSummaries, getLoadoutMembership } from "@/queries/loadouts";
import { getOptionalUserId } from "@/lib/auth";
import { SkinDetailView } from "@/components/gallery/SkinDetailView";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SkinDetailPage({ params, searchParams }: PageProps<"/skins/[id]">) {
  const { id } = await params;
  // Validated for the same reason query-string ids are: this value is the sole
  // key of a cached read, so an unchecked one lets any caller mint unlimited
  // distinct cache entries - each a miss that reaches the database and caches
  // a null. A non-UUID can never match a valorant-api.com id, so rejecting it
  // here costs nothing.
  if (!resolveCatalogId(id)) notFound();
  const sp = await searchParams;
  const [skin, buddy, userId] = await Promise.all([getSkinDetail(id), getBuddy(first(sp.buddyId)), getOptionalUserId()]);

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
      buddy={buddy}
      initialLevelId={first(sp.levelId)}
      initialChromaId={first(sp.chromaId)}
      initialBuddyId={first(sp.buddyId)}
      wishlist={{ isWishlisted, isSignedIn: !!userId }}
      loadouts={loadouts}
      inLoadouts={membership.get(skin.id) ?? []}
    />
  );
}
