import type { Metadata } from "next";
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

/**
 * Decides whether this skin exists *before* the response starts streaming.
 *
 * `src/app/loading.tsx` puts every route behind a Suspense boundary, so Next
 * flushes the shell - committing HTTP 200 - before the page body runs. A
 * `notFound()` from the body then renders the not-found UI under a 200, which
 * is a soft 404: crawlers treat it as a real page and index it. Metadata is
 * resolved before that flush, so calling `notFound()` here produces a genuine
 * 404 status.
 *
 * The lookup is not a second query in practice - `getSkinDetail` is cached, so
 * the page body's call is served from the same entry.
 */
export async function generateMetadata({ params }: PageProps<"/skins/[id]">): Promise<Metadata> {
  const { id } = await params;
  // A value that cannot be a catalog id is rejected without a lookup. It is
  // also the sole key of a cached read, so an unchecked one would let any
  // caller mint unlimited cache entries, each a miss that reaches the database.
  if (!resolveCatalogId(id)) notFound();

  const skin = await getSkinDetail(id);
  if (!skin) notFound();

  const weapon = skin.weapon?.displayName;
  return {
    title: weapon ? `${skin.displayName} - ${weapon}` : skin.displayName,
    description: `${skin.displayName}${weapon ? ` ${weapon}` : ""} skin: levels, chromas and price. Add it to a VALORANT loadout on Valoadout.`,
  };
}

export default async function SkinDetailPage({ params, searchParams }: PageProps<"/skins/[id]">) {
  const { id } = await params;
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
