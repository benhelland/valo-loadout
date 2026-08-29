"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { clearLoadoutItem, deleteLoadout, duplicateLoadout, renameLoadout } from "@/actions/loadouts";
import { encodeCombo } from "@/lib/comboLink";
import { BOARD_COLUMN_GROUPS, CATEGORY_LABELS } from "@/lib/weaponOrder";
import type { getLoadout, listAllWeapons, listLoadoutSummaries } from "@/queries/loadouts";

type Loadout = NonNullable<Awaited<ReturnType<typeof getLoadout>>>;
type LoadoutItem = Loadout["items"][number];
type Weapon = Awaited<ReturnType<typeof listAllWeapons>>[number];
type LoadoutSummary = Awaited<ReturnType<typeof listLoadoutSummaries>>[number];

interface LoadoutBoardProps {
  loadout: Loadout;
  weapons: Weapon[];
  allLoadouts: LoadoutSummary[];
}

// Matches the reference loadout-chart layout supplied directly: a 4-column
// grid grouped by category (Sidearms | SMGs+Shotguns | Rifles+Melee |
// Snipers+Heavy), every slot visible at once, buddy shown as an icon docked
// beside the weapon render in each tile - not the tab/one-weapon-at-a-time
// layout tried first (that was based on researching the real client, which
// turned out not to match what was wanted here - see docs/PRD.md).
export function LoadoutBoard({ loadout, weapons, allLoadouts }: LoadoutBoardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState(loadout.name);
  const [openWeaponId, setOpenWeaponId] = useState<string | null>(null);

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
    startTransition(async () => {
      await deleteLoadout(loadout.id);
      router.push("/loadouts");
    });
  }

  function handleClear(weaponId: string) {
    startTransition(() => clearLoadoutItem(loadout.id, weaponId));
    setOpenWeaponId(null);
  }

  const itemsByWeapon = new Map(loadout.items.map((item) => [item.weaponId, item]));

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/loadouts" className="text-xs font-semibold uppercase tracking-widest text-muted hover:text-accent transition-colors">
        ← All loadouts
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-b-2 border-accent/30 pb-4">
        <div>
          {isRenaming ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => e.key === "Enter" && commitRename()}
              className="border-b border-accent bg-transparent font-display text-5xl uppercase tracking-wide leading-none text-foreground focus:outline-none"
            />
          ) : (
            <h1
              onClick={() => setIsRenaming(true)}
              className="font-display text-5xl uppercase tracking-wide leading-none cursor-pointer hover:text-accent transition-colors"
              title="Click to rename"
            >
              {loadout.name}
            </h1>
          )}
          <p className="mt-2 text-sm uppercase tracking-wide text-muted">
            {loadout.items.length} / {weapons.length} slots filled ·{" "}
            <span className="text-accent font-semibold">{loadout.estimatedTotalVp.toLocaleString()} VP est.</span>
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {allLoadouts.length > 1 ? (
            <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Switch loadout
              <select
                value={loadout.id}
                onChange={(e) => router.push(`/loadouts/${e.target.value}`)}
                className="rounded-none border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none transition-colors"
              >
                {allLoadouts.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            onClick={handleDuplicate}
            disabled={isPending}
            className="clip-notch-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest text-muted hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
          >
            Duplicate
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="clip-notch-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest text-muted hover:text-accent hover:border-accent/40 transition-colors disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-8">
        {BOARD_COLUMN_GROUPS.map((categoriesInColumn, colIndex) => (
          <div key={colIndex} className="flex flex-col gap-8">
            {categoriesInColumn.map((category) => {
              const categoryWeapons = weapons
                .filter((w) => w.category === category)
                .sort((a, b) => a.displayName.localeCompare(b.displayName));
              if (categoryWeapons.length === 0) return null;
              return (
                <div key={category}>
                  <p className="mb-3 text-center text-sm font-semibold uppercase tracking-widest text-foreground">
                    {CATEGORY_LABELS[category] ?? category}
                  </p>
                  <div className="flex flex-col gap-3">
                    {categoryWeapons.map((weapon) => (
                      <WeaponTile
                        key={weapon.id}
                        loadoutId={loadout.id}
                        weapon={weapon}
                        item={itemsByWeapon.get(weapon.id)}
                        isOpen={openWeaponId === weapon.id}
                        onToggle={() => setOpenWeaponId((prev) => (prev === weapon.id ? null : weapon.id))}
                        onClose={() => setOpenWeaponId(null)}
                        onClear={() => handleClear(weapon.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeaponTile({
  loadoutId,
  weapon,
  item,
  isOpen,
  onToggle,
  onClose,
  onClear,
}: {
  loadoutId: string;
  weapon: Weapon;
  item: LoadoutItem | undefined;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onClear: () => void;
}) {
  const router = useRouter();
  const pickerHref = `/loadouts/${loadoutId}/weapon/${weapon.id}`;
  const viewHref = item
    ? `/combo/${encodeCombo({ skinId: item.skinId, levelId: item.levelId, chromaId: item.chromaId, buddyId: item.buddyId })}`
    : null;

  function handleTileClick() {
    if (item) {
      onToggle();
    } else {
      router.push(pickerHref);
    }
  }

  return (
    <div className="group relative">
      <button onClick={handleTileClick} className="clip-notch-sm block w-full border border-border bg-surface text-left hover:border-accent/50 transition-colors">
        <div className="flex">
          <div className="relative h-[76px] flex-1 bg-black/20">
            {item?.skin.displayIconUrl ? (
              <Image src={item.skin.displayIconUrl} alt={item.skin.displayName} fill sizes="220px" className="object-contain p-1.5" />
            ) : weapon.displayIconUrl ? (
              <Image src={weapon.displayIconUrl} alt={weapon.displayName} fill sizes="220px" className="object-contain p-3 opacity-30" />
            ) : null}
          </div>
          <div className="flex w-12 flex-shrink-0 items-center justify-center border-l border-border">
            {item?.buddy?.displayIconUrl ? (
              <div className="relative h-7 w-7">
                <Image src={item.buddy.displayIconUrl} alt={item.buddy.displayName} fill sizes="28px" className="object-contain" />
              </div>
            ) : null}
          </div>
        </div>
        <p className="border-t border-border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground truncate">
          {weapon.displayName}
        </p>
      </button>

      {item ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          title="Clear slot"
          className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs text-muted opacity-0 group-hover:opacity-100 hover:text-accent transition-opacity"
        >
          ×
        </button>
      ) : null}

      {isOpen && item ? (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} />
          <div className="absolute z-20 left-0 top-full mt-1 w-56 border border-accent bg-surface p-4 shadow-xl">
            <p className="text-sm font-semibold truncate">{item.skin.displayName}</p>
            {item.buddy ? <p className="mt-0.5 text-xs font-normal text-muted truncate">{item.buddy.displayName}</p> : null}
            <div className="mt-3 flex gap-2">
              <Link
                href={viewHref!}
                className="clip-notch-sm flex-1 border border-border py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-foreground hover:border-foreground/40 transition-colors"
              >
                View
              </Link>
              <Link
                href={pickerHref}
                className="clip-notch-sm flex-1 bg-accent py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-accent-dark transition-colors"
              >
                Replace
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
