"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createLoadout, deleteLoadout, duplicateLoadout, renameLoadout } from "@/actions/loadouts";
import { ShareLoadoutButton } from "@/components/loadouts/ShareLoadoutButton";
import { formatPriceTotal } from "@/lib/pricing";
import type { listLoadouts, listAllWeapons } from "@/queries/loadouts";

type LoadoutSummary = Awaited<ReturnType<typeof listLoadouts>>[number];
type Weapon = Awaited<ReturnType<typeof listAllWeapons>>[number];

export function LoadoutListClient({ loadouts, weapons }: { loadouts: LoadoutSummary[]; weapons: Weapon[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");

  function handleCreate() {
    const name = newName.trim() || "New Loadout";
    startTransition(async () => {
      const id = await createLoadout(name);
      setNewName("");
      router.push(`/loadouts/${id}`);
    });
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end gap-3 border border-border bg-surface p-5">
        <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted min-w-[220px] flex-1">
          New loadout name
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="e.g. Dark & Sleek"
            className="rounded-none border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none transition-colors"
          />
        </label>
        <button
          onClick={handleCreate}
          disabled={isPending}
          className="clip-notch-sm bg-accent px-6 py-2 text-sm font-bold uppercase tracking-widest text-accent-contrast hover:bg-accent-dark transition-colors disabled:opacity-50"
        >
          Create
        </button>
      </div>

      {loadouts.length === 0 ? (
        <p className="text-center text-muted py-16 uppercase tracking-wide text-sm">
          No loadouts yet - create one above to start assigning skins per weapon.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {loadouts.map((loadout) => (
            <LoadoutCard key={loadout.id} loadout={loadout} weapons={weapons} />
          ))}
        </div>
      )}
    </div>
  );
}

function LoadoutCard({ loadout, weapons }: { loadout: LoadoutSummary; weapons: Weapon[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState(loadout.name);

  function commitRename() {
    setIsRenaming(false);
    if (name.trim() && name.trim() !== loadout.name) {
      startTransition(() => renameLoadout(loadout.id, name.trim()));
    } else {
      setName(loadout.name);
    }
  }

  function handleDuplicate() {
    startTransition(async () => {
      const id = await duplicateLoadout(loadout.id);
      router.push(`/loadouts/${id}`);
    });
  }

  function handleDelete() {
    startTransition(() => deleteLoadout(loadout.id));
  }

  return (
    <div className="clip-notch border border-border bg-surface p-5">
      {isRenaming ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => e.key === "Enter" && commitRename()}
          className="w-full border-b border-accent bg-transparent font-display text-2xl uppercase tracking-wide leading-none text-foreground focus:outline-none"
        />
      ) : (
        <Link href={`/loadouts/${loadout.id}`}>
          <h2 className="font-display text-2xl uppercase tracking-wide leading-none hover:text-accent transition-colors">
            {loadout.name}
          </h2>
        </Link>
      )}

      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {loadout.items.length} / 20 slots filled
      </p>
      <p className="mt-1 text-sm font-semibold text-accent">{formatPriceTotal(loadout.priceTotal)}</p>

      <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wider">
        <Link href={`/loadouts/${loadout.id}`} className="text-muted hover:text-foreground transition-colors">
          Open
        </Link>
        <button onClick={() => setIsRenaming(true)} disabled={isPending} className="text-muted hover:text-foreground transition-colors">
          Rename
        </button>
        <button onClick={handleDuplicate} disabled={isPending} className="text-muted hover:text-foreground transition-colors">
          Duplicate
        </button>
        <ShareLoadoutButton
          loadout={loadout}
          weapons={weapons}
          initialShareSlug={loadout.shareSlug}
          variant="inline"
        />
        <button onClick={handleDelete} disabled={isPending} className="text-muted hover:text-accent transition-colors">
          Delete
        </button>
      </div>
    </div>
  );
}
