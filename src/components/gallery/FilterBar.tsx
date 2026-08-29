"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
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
  // filter choice. Also scopes the search bar's suggestions to it.
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

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-end gap-4 border border-border border-t-2 border-t-accent bg-surface p-5">
      <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted min-w-[200px] flex-1">
        Search
        <SearchAutocomplete
          defaultValue={current.search}
          onDebouncedChange={(value) => updateParam("search", value)}
          weaponId={lockedWeaponId}
          resultHrefBase={resultHrefBase}
        />
      </label>

      {hideWeaponFilter ? null : (
        <Select name="weaponId" label="Weapon" current={current.weaponId} onChange={(v) => updateParam("weaponId", v)}>
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

      <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted pb-2">
        <input
          type="checkbox"
          defaultChecked={current.hasAnimation === "1"}
          onChange={(e) => updateParam("hasAnimation", e.target.checked ? "1" : "")}
          className="rounded-none border-border accent-accent"
        />
        Has animation
      </label>

      <Link
        href={clearHref}
        className="text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-foreground pb-2.5"
      >
        Clear
      </Link>
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
      <select
        name={name}
        defaultValue={current ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-none border border-border bg-background px-3 py-2 text-sm text-foreground min-w-[130px] focus:border-accent focus:outline-none transition-colors"
      >
        {includeBlank ? <option value="">All</option> : null}
        {children}
      </select>
    </label>
  );
}
