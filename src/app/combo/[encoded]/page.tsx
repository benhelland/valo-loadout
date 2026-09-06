import { notFound } from "next/navigation";
import { decodeCombo } from "@/lib/comboLink";
import { getSkinDetail, getBuddy } from "@/queries/gallery";
import { isSkinWishlisted } from "@/queries/wishlist";
import { getOptionalUserId } from "@/lib/auth";
import { SkinDetailView } from "@/components/gallery/SkinDetailView";

// Stateless combo share link - see docs/ARCHITECTURE.md "Sharing". Nothing is
// stored: the skin/level/chroma/buddy IDs live entirely in the URL, and this
// route just decodes them and re-fetches the referenced catalog rows. A
// garbled or tampered :encoded value, or IDs that don't belong to the skin,
// fail closed via notFound() or simply fall back to the skin's defaults.
export default async function ComboPage({ params }: PageProps<"/combo/[encoded]">) {
  const { encoded } = await params;
  const combo = decodeCombo(encoded);
  if (!combo) notFound();

  const [skin, buddy, userId] = await Promise.all([
    getSkinDetail(combo.skinId),
    getBuddy(combo.buddyId),
    getOptionalUserId(),
  ]);
  if (!skin) notFound();

  // A shared combo link is a discovery channel - someone lands here because
  // a friend sent them a skin. Offering the wishlist here turns "nice skin"
  // into a saved intent (and, for a signed-out visitor, into the sign-in
  // prompt); without it the page was a dead end with nothing to do but leave.
  const isWishlisted = userId ? await isSkinWishlisted(userId, skin.id) : false;

  return (
    <SkinDetailView
      skin={skin}
      buddy={buddy}
      initialLevelId={combo.levelId}
      initialChromaId={combo.chromaId}
      initialBuddyId={combo.buddyId}
      backHref={`/skins/${skin.id}`}
      backLabel="← View full skin page"
      wishlist={{ isWishlisted, isSignedIn: !!userId }}
    />
  );
}
