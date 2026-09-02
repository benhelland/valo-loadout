"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { SearchAutocomplete } from "@/components/gallery/SearchAutocomplete";

interface BuddyFilterBarProps {
  colorOptions: string[];
  current: { search?: string; color?: string };
  clearHref: string;
}

// Mirrors the skin gallery's FilterBar: every control auto-applies on
// change via the URL, no Apply button. Uses the same SearchAutocomplete
// component, in its no-dropdown mode - a buddy has no detail page to jump
// to, so predictive suggestions would have nowhere to link; the fuzzy
// search still filters the grid live as you type.
export function BuddyFilterBar({ colorOptions, current, clearHref }: BuddyFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchText, setSearchText] = useState(current.search ?? "");

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-end gap-4 border border-border bg-surface p-5">
      <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted min-w-[200px] flex-1">
        Search
        <SearchAutocomplete
          value={searchText}
          onChange={setSearchText}
          onDebouncedChange={(value) => updateParam("search", value)}
          resultHrefBase=""
          disableSuggestions
          placeholder="Buddy name..."
        />
      </label>

      <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
        Color
        <select
          value={current.color ?? ""}
          onChange={(e) => updateParam("color", e.target.value)}
          className="rounded-none border border-border bg-background px-3 py-2 text-sm text-foreground min-w-[130px] focus:border-accent focus:outline-none transition-colors"
        >
          <option value="">All</option>
          {colorOptions.map((c) => (
            <option key={c} value={c}>
              {c[0].toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
      </label>

      {/* Plain <a> for a full reload, same reasoning as the skin gallery's
          Clear - guarantees the locally-owned search text resets too. */}
      <a
        href={clearHref}
        className="text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-foreground pb-2.5"
      >
        Clear
      </a>
    </div>
  );
}
