"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { clearLoadoutItem, deleteLoadout, duplicateLoadout, renameLoadout } from "@/actions/loadouts";
import { estimatePriceVp } from "@/lib/pricing";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/weaponOrder";
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

// Mirrors the real client's Collection screen: a category tab bar, then a
// row of weapons within that category, then one large focused view of
// whichever weapon is selected - not a grid of all 20 slots at once (that
// was tried first; verified against the actual game before rebuilding this
// - see docs/PRD.md "Board layout").
export function LoadoutBoard({ loadout, weapons, allLoadouts }: LoadoutBoardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState(loadout.name);

  const categories = CATEGORY_ORDER.filter((cat) => weapons.some((w) => w.category === cat));
  const [activeCategory, setActiveCategory] = useState<string>(categories[0] ?? "");
  const weaponsInCategory = weapons.filter((w) => w.category === activeCategory);

  // Derived, not synced via an effect: whenever the category changes and the
  // last-picked weapon isn't in it, this falls back to the category's first
  // weapon on the very next render - no cascading-render risk.
  const [selectedWeaponId, setSelectedWeaponId] = useState<string | undefined>(weaponsInCategory[0]?.id);
  const activeWeaponId = weaponsInCategory.some((w) => w.id === selectedWeaponId) ? selectedWeaponId : weaponsInCategory[0]?.id;

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
  const activeWeapon = weaponsInCategory.find((w) => w.id === activeWeaponId);
  const activeItem = activeWeapon ? itemsByWeapon.get(activeWeapon.id) : undefined;

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

      {/* Category tabs */}
      <div className="mt-6 flex gap-6 overflow-x-auto border-b border-border">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`whitespace-nowrap border-b-2 pb-3 text-sm font-semibold uppercase tracking-widest transition-colors ${
              activeCategory === cat ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {CATEGORY_LABELS[cat] ?? cat}
          </button>
        ))}
      </div>

      {/* Weapon row within the active category */}
      <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
        {weaponsInCategory.map((weapon) => {
          const item = itemsByWeapon.get(weapon.id);
          const isActive = weapon.id === activeWeaponId;
          return (
            <button
              key={weapon.id}
              onClick={() => setSelectedWeaponId(weapon.id)}
              className={`clip-notch-sm flex-shrink-0 border p-2 transition-colors ${
                isActive ? "border-accent bg-accent/10" : "border-border bg-surface hover:border-foreground/30"
              }`}
            >
              <div className="relative h-14 w-24 bg-black/20">
                {item?.skin.displayIconUrl ? (
                  <Image src={item.skin.displayIconUrl} alt={item.skin.displayName} fill sizes="96px" className="object-contain p-1" />
                ) : weapon.displayIconUrl ? (
                  <Image src={weapon.displayIconUrl} alt={weapon.displayName} fill sizes="96px" className="object-contain p-2 opacity-40" />
                ) : null}
              </div>
              <p className={`mt-1 text-[10px] font-semibold uppercase tracking-wider ${isActive ? "text-foreground" : "text-muted"}`}>
                {weapon.displayName}
              </p>
            </button>
          );
        })}
      </div>

      {/* Large focused panel for the selected weapon */}
      {activeWeapon ? (
        <ActiveWeaponPanel
          loadoutId={loadout.id}
          weapon={activeWeapon}
          item={activeItem}
          onClear={() => handleClear(activeWeapon.id)}
        />
      ) : null}
    </div>
  );
}

function ActiveWeaponPanel({
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
  const price = item ? estimatePriceVp(item.skin.contentTier?.devName) : null;

  return (
    <div className="mt-6 grid lg:grid-cols-[1fr_360px] gap-8 items-start">
      <div className="relative border border-border bg-surface overflow-hidden aspect-video lg:aspect-auto lg:h-[480px]">
        {item?.skin.displayIconUrl ? (
          <Image
            key={item.skin.id}
            src={item.skin.displayIconUrl}
            alt={item.skin.displayName}
            fill
            sizes="(max-width: 1024px) 100vw, 60vw"
            className="object-contain p-10"
          />
        ) : weapon.displayIconUrl ? (
          <Image
            src={weapon.displayIconUrl}
            alt={weapon.displayName}
            fill
            sizes="(max-width: 1024px) 100vw, 60vw"
            className="object-contain p-16 opacity-30"
          />
        ) : null}

        <span className="pointer-events-none absolute left-3 top-3 h-6 w-6 border-l-2 border-t-2 border-accent/70" />
        <span className="pointer-events-none absolute right-3 top-3 h-6 w-6 border-r-2 border-t-2 border-accent/70" />
        <span className="pointer-events-none absolute left-3 bottom-3 h-6 w-6 border-l-2 border-b-2 border-accent/70" />
        <span className="pointer-events-none absolute right-3 bottom-3 h-6 w-6 border-r-2 border-b-2 border-accent/70" />

        {item?.buddy?.displayIconUrl ? (
          <div
            title={item.buddy.displayName}
            className="absolute top-4 right-4 h-16 w-16 rounded-full border-2 border-accent/60 bg-black/60 p-2 shadow-lg backdrop-blur-sm"
          >
            <div className="relative h-full w-full">
              <Image src={item.buddy.displayIconUrl} alt={item.buddy.displayName} fill sizes="64px" className="object-contain" />
            </div>
          </div>
        ) : null}
      </div>

      <div className="border border-border border-t-2 border-t-accent bg-surface p-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{weapon.displayName}</p>
        <h2 className="mt-1 font-display text-3xl uppercase tracking-wide leading-none">
          {item ? item.skin.displayName : "Empty Slot"}
        </h2>

        {item ? (
          <dl className="mt-4 space-y-0">
            {item.level ? (
              <div className="flex justify-between border-b border-border py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Level</dt>
                <dd className="text-sm font-semibold">{item.level.levelIndex}</dd>
              </div>
            ) : null}
            {item.chroma?.displayName ? (
              <div className="flex justify-between border-b border-border py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Color</dt>
                <dd className="text-sm font-semibold">{item.chroma.displayName}</dd>
              </div>
            ) : null}
            {item.buddy ? (
              <div className="flex justify-between border-b border-border py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Buddy</dt>
                <dd className="text-sm font-semibold">{item.buddy.displayName}</dd>
              </div>
            ) : null}
            {price !== null ? (
              <div className="flex justify-between border-b border-border py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Price (est.)</dt>
                <dd className="text-sm font-semibold text-accent">{price.toLocaleString()} VP</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="mt-4 text-sm text-muted">No skin assigned to this slot yet.</p>
        )}

        <Link
          href={pickerHref}
          className="clip-notch-sm mt-6 block w-full bg-accent py-2.5 text-center text-xs font-bold uppercase tracking-widest text-white hover:bg-accent-dark transition-colors"
        >
          {item ? "Change Skin" : "Assign Skin"}
        </Link>

        {item ? (
          <button
            onClick={onClear}
            className="clip-notch-sm mt-3 w-full border border-border py-2.5 text-xs font-semibold uppercase tracking-widest text-muted hover:text-accent hover:border-accent/40 transition-colors"
          >
            Clear Slot
          </button>
        ) : null}
      </div>
    </div>
  );
}
