import { notFound } from "next/navigation";
import { getSkinDetail, listBuddies } from "@/queries/gallery";
import { SkinDetailView } from "@/components/gallery/SkinDetailView";

export default async function SkinDetailPage({ params }: PageProps<"/skins/[id]">) {
  const { id } = await params;
  const [skin, buddies] = await Promise.all([getSkinDetail(id), listBuddies()]);

  if (!skin) notFound();

  return <SkinDetailView skin={skin} buddies={buddies} />;
}
