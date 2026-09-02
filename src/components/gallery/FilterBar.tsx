"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { COLOR_FAMILIES } from "@/lib/colorFamilies";
import { SearchAutocomplete } from "@/components/gallery/SearchAutocomplete";
import type { Weapon, ContentTier, Theme } from "@/generated/prisma/client";

interface FilterBarProps {
  weapons: Weapon[];
  tiers: ContentTier[];
  themes: Theme[];
  vibeTags: readonly string[];
  current: {
    weaponId?: string;
    tierId?: string;
    themeId?: string;
    color?: string;
    vibe?: string;
    hasAnimation?: string;
    search?: string;
    sort?: string;
  };
  // Hides the weapon dropdown - used by the loadout picker, where the
  // weapon is already locked by the slot you clicked into, not a free
  // filter choice. Also scopes the search bar's suggestions to it. The main
  // gallery also passes this now, because weapon selection moved out to
  // WeaponRail (a far better fit for the primary browse axis).
  hideWeaponFilter?: boolean;
  lockedWeaponId?: string;
  // Overrides the "Clear" link target - the loadout picker needs it to
  // clear back to its own scoped URL, not the main gallery.
  clearHref?: string;
  // Where a clicked search suggestion links to.
  resultHrefBase?: string;
}

// Every control here applies its filter immediately on change - no Apply
// button. Each one rewrites the URL's query string (via router.replace, so
// filtering stays fast and doesn't pile up history entries) and always
// resets `page` back to 1, since a filter change invalidates whatever page
// you were on. State still lives entirely in the URL, so results stay
// server-rendered, shareable, and bookmarkable - only the controls
// themselves need to be a client component.
export function FilterBar({
  weapons,
  tiers,
  themes,
  vibeTags,
  current,
  hideWeaponFilter,
  lockedWeaponId,
  clearHref = "/",
  resultHrefBase = "/skins",
}: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Owned here, not resynced from props after mount - see the comment in
  // SearchAutocomplete.tsx for why that resync approach caused typing to
  // occasionally clobber itself.
  const [searchText, setSearchText] = useState(current.search ?? "");
  // Collapsed by default on phones only (the `md:block` below always wins on
  // desktop). The expanded bar is ~700px tall at 375px wide, which pushed
  // every single skin below the fold - you had to scroll past a wall of
  // dropdowns to reach the content you came for.
  const [openOnMobile, setOpenOnMobile] = useState(false);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Active filters, resolved to human labels. Sort is excluded on purpose -
  // it always has a value, so showing it as a removable "filter" would be
  // misleading. Weapon is excluded when the rail owns it, since the rail
  // already shows its own selection state.
  const activeChips: { key: string; label: string }[] = [];
  if (!hideWeaponFilter && current.weaponId) {
    const weapon = weapons.find((w) => w.id === current.weaponId);
    if (weapon) activeChips.push({ key: "weaponId", label: weapon.displayName });
  }
  if (current.tierId) {
    const tier = tiers.find((t) => t.id === current.tierId);
    if (tier) activeChips.push({ key: "tierId", label: tier.displayName });
  }
  if (current.themeId) {
    const theme = themes.find((t) => t.id === current.themeId);
    if (theme) activeChips.push({ key: "themeId", label: theme.displayName });
  }
  if (current.color) activeChips.push({ key: "color", label: current.color });
  if (current.vibe) activeChips.push({ key: "vibe", label: current.vibe });
  if (current.hasAnimation === "1") activeChips.push({ key: "hasAnimation", label: "Has animation" });
  if (current.search) activeChips.push({ key: "search", label: `"${current.search}"` });

  function clearChip(key: string) {
    if (key === "search") setSearchText("");
    updateParam(key, "");
  }

  return (
    <div className="border border-border bg-surface">
      {/* Mobile-only toggle. Shows the active count so a collapsed bar never
          hides the fact that filters are applied. */}
      <button
        type="button"
        onClick={() => setOpenOnMobile((v) => !v)}
        aria-expanded={openOnMobile}
        className="flex w-full items-center justify-between px-5 py-3 text-xs font-semibold uppercase tracking-widest text-muted md:hidden"
      >
        <span>
          Filters
          {activeChips.length > 0 ? <span className="ml-2 text-accent">{activeChips.length}</span> : null}
        </span>
        <span aria-hidden>{openOnMobile ? "−" : "+"}</span>
      </button>

      <div className={`${openOnMobile ? "block" : "hidden"} md:block`}>
        <div className="flex flex-wrap items-end gap-4 p-5">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Search
            <SearchAutocomplete
              value={searchText}
              onChange={setSearchText}
              onDebouncedChange={(value) => updateParam("search", value)}
              weaponId={lockedWeaponId}
              resultHrefBase={resultHrefBase}
            />
          </label>

          {hideWeaponFilter ? null : (
            <Select
              name="weaponId"
              label="Weapon"
              current={current.weaponId}
              onChange={(v) => updateParam("weaponId", v)}
            >
              {weapons.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.displayName}
                </option>
              ))}
            </Select>
          )}

          <Select name="tierId" label="Tier" current={current.tierId} onChange={(v) => updateParam("tierId", v)}>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName}
              </option>
            ))}
          </Select>

          <Select name="themeId" label="Collection" current={current.themeId} onChange={(v) => updateParam("themeId", v)}>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName}
              </option>
            ))}
          </Select>

          <Select name="color" label="Color" current={current.color} onChange={(v) => updateParam("color", v)}>
            {COLOR_FAMILIES.map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </Select>

          <Select name="vibe" label="Vibe" current={current.vibe} onChange={(v) => updateParam("vibe", v)}>
            {vibeTags.map((v) => (
              <option key={v} value={v}>
                {v[0].toUpperCase() + v.slice(1)}
              </option>
            ))}
          </Select>

          <Select
            name="sort"
            label="Sort"
            current={current.sort}
            includeBlank={false}
            onChange={(v) => updateParam("sort", v)}
          >
            <option value="rarity">Rarity: highest first</option>
            <option value="newest">Newest</option>
            <option value="price">Price: low to high</option>
            <option value="alphabetical">Alphabetical</option>
          </Select>

          <label className="flex items-center gap-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <input
              type="checkbox"
              checked={current.hasAnimation === "1"}
              onChange={(e) => updateParam("hasAnimation", e.target.checked ? "1" : "")}
              className="rounded-none border-border accent-accent"
            />
            Has animation
          </label>
        </div>

        {/* Active-filter chips. Previously the only way to know what was
            applied was to read all six dropdowns one at a time, and the only
            way to undo one was to find it and set it back to "All". */}
        {activeChips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => clearChip(chip.key)}
                className="clip-notch-sm flex items-center gap-1.5 border border-accent/40 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-accent"
              >
                {chip.label}
                <span aria-hidden className="text-muted">
                  ✕
                </span>
                <span className="sr-only">Remove filter</span>
              </button>
            ))}
            {/* A plain <a>, not next/link's <Link> - forces a real full-page
                navigation so every control (the now-locally-owned search
                text, and the uncontrolled selects) resets to its true
                default, with no question of whether client-side state
                survives a soft transition. Clear is a deliberate,
                infrequent action, not something that needs to feel instant
                the way typing does. */}
            <a
              href={clearHref}
              className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-muted transition-colors hover:text-foreground"
            >
              Clear all
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Select({
  name,
  label,
  current,
  children,
  includeBlank = true,
  onChange,
}: {
  name: string;
  label: string;
  current?: string;
  children: React.ReactNode;
  includeBlank?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
      {label}
      {/* Still a native <select>. The reason the old ones looked wrong was
          the OS-drawn popup rendering light against this dark UI - fixed
          globally by `color-scheme: dark` in globals.css, which is a far
          better trade than hand-rolling a listbox and re-implementing
          keyboard nav, focus management and mobile's native picker. */}
      <select
        name={name}
        value={current ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[130px] rounded-none border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors focus:border-accent focus:outline-none"
      >
        {includeBlank ? <option value="">All</option> : null}
        {children}
      </select>
    </label>
  );
}
