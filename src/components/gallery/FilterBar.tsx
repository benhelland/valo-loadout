import Link from "next/link";
import { COLOR_FAMILIES } from "@/lib/color";
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
}

export function FilterBar({ weapons, tiers, themes, vibeTags, current }: FilterBarProps) {
  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-4 border border-border border-t-2 border-t-accent bg-surface p-5"
    >
      <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted min-w-[160px] flex-1">
        Search
        <input
          type="text"
          name="search"
          defaultValue={current.search}
          placeholder="Skin name..."
          className="rounded-none border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none transition-colors"
        />
      </label>

      <Select name="weaponId" label="Weapon" current={current.weaponId}>
        {weapons.map((w) => (
          <option key={w.id} value={w.id}>
            {w.displayName}
          </option>
        ))}
      </Select>

      <Select name="tierId" label="Tier" current={current.tierId}>
        {tiers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.displayName}
          </option>
        ))}
      </Select>

      <Select name="themeId" label="Collection" current={current.themeId}>
        {themes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.displayName}
          </option>
        ))}
      </Select>

      <Select name="color" label="Color" current={current.color}>
        {COLOR_FAMILIES.map((c) => (
          <option key={c} value={c}>
            {c[0].toUpperCase() + c.slice(1)}
          </option>
        ))}
      </Select>

      <Select name="vibe" label="Vibe" current={current.vibe}>
        {vibeTags.map((v) => (
          <option key={v} value={v}>
            {v[0].toUpperCase() + v.slice(1)}
          </option>
        ))}
      </Select>

      <Select name="sort" label="Sort" current={current.sort} includeBlank={false}>
        <option value="newest">Newest</option>
        <option value="price">Price: low to high</option>
        <option value="rarity">Rarity: highest first</option>
        <option value="alphabetical">Alphabetical</option>
      </Select>

      <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted pb-2">
        <input
          type="checkbox"
          name="hasAnimation"
          value="1"
          defaultChecked={current.hasAnimation === "1"}
          className="rounded-none border-border accent-accent"
        />
        Has animation
      </label>

      <button
        type="submit"
        className="clip-notch-sm bg-accent px-6 py-2 text-sm font-bold uppercase tracking-widest text-white hover:bg-accent-dark transition-colors"
      >
        Apply
      </button>
      <Link
        href="/"
        className="text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-foreground pb-2.5"
      >
        Clear
      </Link>
    </form>
  );
}

function Select({
  name,
  label,
  current,
  children,
  includeBlank = true,
}: {
  name: string;
  label: string;
  current?: string;
  children: React.ReactNode;
  includeBlank?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
      {label}
      <select
        name={name}
        defaultValue={current ?? ""}
        className="rounded-none border border-border bg-background px-3 py-2 text-sm text-foreground min-w-[130px] focus:border-accent focus:outline-none transition-colors"
      >
        {includeBlank ? <option value="">All</option> : null}
        {children}
      </select>
    </label>
  );
}
