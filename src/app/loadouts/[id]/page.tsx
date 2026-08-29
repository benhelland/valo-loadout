import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { getLoadout, listAllWeapons, listLoadoutSummaries } from "@/queries/loadouts";
import { sortByWeaponOrder } from "@/lib/weaponOrder";
import { LoadoutBoard } from "@/components/loadouts/LoadoutBoard";

export default async function LoadoutBoardPage({ params }: PageProps<"/loadouts/[id]">) {
  const { id } = await params;
  const userId = await getCurrentUserId();

  const [loadout, weapons, allLoadouts] = await Promise.all([
    getLoadout(id, userId),
    listAllWeapons(),
    listLoadoutSummaries(userId),
  ]);

  if (!loadout) notFound();

  return <LoadoutBoard loadout={loadout} weapons={sortByWeaponOrder(weapons)} allLoadouts={allLoadouts} />;
}
