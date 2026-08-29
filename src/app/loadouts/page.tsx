import { getCurrentUserId } from "@/lib/auth";
import { listLoadouts, listAllWeapons } from "@/queries/loadouts";
import { sortByWeaponOrder } from "@/lib/weaponOrder";
import { LoadoutListClient } from "@/components/loadouts/LoadoutListClient";

export default async function LoadoutsPage() {
  const userId = await getCurrentUserId();
  // Weapons are needed here only so each card's Share action can render the
  // full board off-screen for image export.
  const [loadouts, weapons] = await Promise.all([listLoadouts(userId), listAllWeapons()]);

  return (
    <div className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex items-baseline gap-4 border-l-4 border-accent pl-4">
        <h1 className="font-display text-5xl uppercase tracking-wide leading-none">Loadouts</h1>
        <p className="text-sm uppercase tracking-wide text-muted">
          {loadouts.length} saved {loadouts.length === 1 ? "loadout" : "loadouts"}
        </p>
      </div>

      <LoadoutListClient loadouts={loadouts} weapons={sortByWeaponOrder(weapons)} />
    </div>
  );
}
