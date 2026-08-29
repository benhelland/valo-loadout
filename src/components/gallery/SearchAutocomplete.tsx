"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { searchSkinsAutocomplete, type SkinSuggestion } from "@/actions/search";

interface SearchAutocompleteProps {
  // Fully controlled - the parent (FilterBar) owns the text. This component
  // never reads back a "current" value from the URL/props after mount: an
  // earlier version tried to resync from a `defaultValue` prop that
  // round-tripped through a debounced URL update, which raced against fast
  // typing (an older debounced response could land after a newer one and
  // clobber text the user had already typed further ahead of). Being fully
  // controlled by the parent, with no resync logic here at all, removes
  // that race entirely.
  value: string;
  onChange: (value: string) => void;
  // Called (debounced) as the user types, to drive the main filtered grid.
  onDebouncedChange: (value: string) => void;
  // Scopes suggestions to one weapon - set by the loadout picker.
  weaponId?: string;
  // Where a clicked suggestion links to - "/skins" on the main gallery,
  // "{pickerBasePath}/skins" in the loadout picker.
  resultHrefBase: string;
  debounceMs?: number;
  // Turns off the predictive dropdown entirely, leaving just the debounced
  // text input. Used by the buddy gallery: buddies have no detail page for
  // a suggestion to link to, so the grid's own live filtering is the whole
  // feature there.
  disableSuggestions?: boolean;
  placeholder?: string;
}

export function SearchAutocomplete({
  value,
  onChange,
  onDebouncedChange,
  weaponId,
  resultHrefBase,
  debounceMs = 300,
  disableSuggestions = false,
  placeholder = "Skin name...",
}: SearchAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<SkinSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  function runDebounced(nextValue: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      onDebouncedChange(nextValue);
      if (disableSuggestions) return;
      const trimmed = nextValue.trim();
      if (trimmed.length < 2) {
        setSuggestions([]);
        return;
      }
      const requestId = ++requestIdRef.current;
      const results = await searchSkinsAutocomplete(trimmed, weaponId);
      if (requestId === requestIdRef.current) setSuggestions(results); // ignore stale responses
    }, debounceMs);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextValue = e.target.value;
    onChange(nextValue);
    setIsOpen(true);
    runDebounced(nextValue);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      onDebouncedChange(value);
      setIsOpen(false);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsOpen(true)}
        // Delay closing so a click on a suggestion registers before the
        // dropdown unmounts.
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none transition-colors"
      />

      {isOpen && suggestions.length > 0 ? (
        <div className="absolute z-30 mt-1 w-full max-w-xs border border-accent bg-surface shadow-xl">
          {suggestions.map((s) => (
            <Link
              key={s.id}
              href={`${resultHrefBase}/${s.id}`}
              className="flex items-center gap-2.5 border-b border-border px-3 py-2 last:border-b-0 hover:bg-surface-hover transition-colors"
            >
              <div className="relative h-8 w-11 flex-shrink-0 bg-black/20">
                {s.displayIconUrl ? (
                  <Image src={s.displayIconUrl} alt={s.displayName} fill sizes="44px" className="object-contain" />
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{s.displayName}</p>
                {s.weaponName ? <p className="truncate text-[10px] uppercase tracking-wide text-muted">{s.weaponName}</p> : null}
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
