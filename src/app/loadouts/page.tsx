import { getCurrentUserId } from "@/lib/auth";
import { listLoadouts } from "@/queries/loadouts";
import { LoadoutListClient } from "@/components/loadouts/LoadoutListClient";

export default async function LoadoutsPage() {
  const userId = await getCurrentUserId();
  const loadouts = await listLoadouts(userId);

  return (
    <div className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex items-baseline gap-4 border-l-4 border-accent pl-4">
        <h1 className="font-display text-5xl uppercase tracking-wide leading-none">Loadouts</h1>
        <p className="text-sm uppercase tracking-wide text-muted">
          {loadouts.length} saved {loadouts.length === 1 ? "loadout" : "loadouts"}
        </p>
      </div>

      <LoadoutListClient loadouts={loadouts} />
    </div>
  );
}
