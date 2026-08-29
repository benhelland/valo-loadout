import { notFound } from "next/navigation";
import { getSkinDetail, listBuddies } from "@/queries/gallery";
import { SkinDetailView } from "@/components/gallery/SkinDetailView";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SkinDetailPage({ params, searchParams }: PageProps<"/skins/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const [skin, buddies] = await Promise.all([getSkinDetail(id), listBuddies()]);

  if (!skin) notFound();

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
    />
  );
}
