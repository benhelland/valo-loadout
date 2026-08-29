import { notFound } from "next/navigation";
import { decodeCombo } from "@/lib/comboLink";
import { getSkinDetail, listBuddies } from "@/queries/gallery";
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

  const [skin, buddies] = await Promise.all([getSkinDetail(combo.skinId), listBuddies()]);
  if (!skin) notFound();

  return (
    <SkinDetailView
      skin={skin}
      buddies={buddies}
      initialLevelId={combo.levelId}
      initialChromaId={combo.chromaId}
      initialBuddyId={combo.buddyId}
      backHref={`/skins/${skin.id}`}
      backLabel="← View full skin page"
    />
  );
}
