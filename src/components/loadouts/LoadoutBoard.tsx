"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { clearLoadoutItem, deleteLoadout, duplicateLoadout, renameLoadout } from "@/actions/loadouts";
import { CATEGORY_LABELS, categoryRank } from "@/lib/weaponOrder";
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

export function LoadoutBoard({ loadout, weapons, allLoadouts }: LoadoutBoardProps) {
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
    startTransition(async () => {
      await deleteLoadout(loadout.id);
      router.push("/loadouts");
    });
  }

  function handleClear(weaponId: string) {
    startTransition(() => clearLoadoutItem(loadout.id, weaponId));
  }

  const itemsByWeapon = new Map(loadout.items.map((item) => [item.weaponId, item]));

  // Group the already-category-ordered weapon list into sections, without
  // re-sorting (weapons arrives pre-sorted via sortByWeaponOrder).
  const sections: { category: string; weapons: Weapon[] }[] = [];
  for (const weapon of weapons) {
    const last = sections[sections.length - 1];
    if (last && categoryRank(last.category) === categoryRank(weapon.category)) {
      last.weapons.push(weapon);
    } else {
      sections.push({ category: weapon.category ?? "Other", weapons: [weapon] });
    }
  }

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

      <div className="mt-8 space-y-10">
        {sections.map((section) => (
          <div key={section.category}>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted border-l-2 border-accent pl-2">
              {CATEGORY_LABELS[section.category] ?? section.category}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {section.weapons.map((weapon) => (
                <WeaponSlot
                  key={weapon.id}
                  loadoutId={loadout.id}
                  weapon={weapon}
                  item={itemsByWeapon.get(weapon.id)}
                  onClear={() => handleClear(weapon.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeaponSlot({
  loadoutId,
  weapon,
  item,
  onClear,
}: {
  loadoutId: string;
  weapon: Weapon;
  item: LoadoutItem | undefined;
  onClear: () => void;
}) {
  const pickerHref = `/loadouts/${loadoutId}/weapon/${weapon.id}`;

  return (
    <div className="relative group">
      <Link
        href={pickerHref}
        className={`clip-notch-sm block border p-3 transition-colors ${
          item ? "border-border bg-surface hover:border-accent/50" : "border-border/60 bg-surface/40 hover:border-foreground/30"
        }`}
      >
        <div className="relative aspect-square bg-black/20">
          {item ? (
            item.skin.displayIconUrl ? (
              <Image src={item.skin.displayIconUrl} alt={item.skin.displayName} fill sizes="150px" className="object-contain p-2" />
            ) : null
          ) : weapon.displayIconUrl ? (
            <Image
              src={weapon.displayIconUrl}
              alt={weapon.displayName}
              fill
              sizes="150px"
              className="object-contain p-4 opacity-30"
            />
          ) : null}

          {item?.buddy?.displayIconUrl ? (
            <div className="absolute bottom-1 right-1 h-6 w-6 rounded-full border border-accent/60 bg-black/70 p-0.5">
              <div className="relative h-full w-full">
                <Image src={item.buddy.displayIconUrl} alt={item.buddy.displayName} fill sizes="24px" className="object-contain" />
              </div>
            </div>
          ) : null}
        </div>

        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted truncate">{weapon.displayName}</p>
        <p className={`text-xs font-semibold truncate ${item ? "text-foreground" : "text-muted/50"}`}>
          {item ? item.skin.displayName : "Empty"}
        </p>
      </Link>

      {item ? (
        <button
          onClick={(e) => {
            e.preventDefault();
            onClear();
          }}
          title="Clear slot"
          className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs text-muted opacity-0 group-hover:opacity-100 hover:text-accent transition-opacity"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
