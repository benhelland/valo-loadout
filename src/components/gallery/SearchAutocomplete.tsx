"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { searchSkinsAutocomplete, type SkinSuggestion } from "@/actions/search";

interface SearchAutocompleteProps {
  defaultValue?: string;
  // Called (debounced) as the user types, to drive the main filtered grid -
  // separate from the dropdown below, which is a faster, smaller lookup for
  // jumping straight to one skin.
  onDebouncedChange: (value: string) => void;
  // Scopes suggestions to one weapon - set by the loadout picker.
  weaponId?: string;
  // Where a clicked suggestion links to - "/skins" on the main gallery,
  // "{pickerBasePath}/skins" in the loadout picker.
  resultHrefBase: string;
  debounceMs?: number;
}

export function SearchAutocomplete({
  defaultValue,
  onDebouncedChange,
  weaponId,
  resultHrefBase,
  debounceMs = 300,
}: SearchAutocompleteProps) {
  const [text, setText] = useState(defaultValue ?? "");
  const [suggestions, setSuggestions] = useState<SkinSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  // Tracks the last value *we* pushed via onDebouncedChange, so the resync
  // check below can tell "the URL changed because we typed" apart from "the
  // URL changed externally" (Clear link, browser back/forward, a direct URL
  // edit). State, not a ref: this project's lint rules forbid reading/
  // writing refs during render, and this needs to be read during render.
  const [lastPushed, setLastPushed] = useState(defaultValue ?? "");

  // Resync from an external change only. Adjusting state during render
  // (not in an effect) is the supported pattern for this - see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  // Naively resyncing on *every* defaultValue change would clobber an
  // in-flight keystroke: our own debounced update round-trips back down as
  // a new defaultValue prop, which can arrive after the user has already
  // typed further ahead of that slower round trip. Skipping when
  // defaultValue matches what we last pushed avoids that.
  if ((defaultValue ?? "") !== lastPushed && (defaultValue ?? "") !== text) {
    setLastPushed(defaultValue ?? "");
    setText(defaultValue ?? "");
  }

  function pushValue(value: string) {
    setLastPushed(value);
    onDebouncedChange(value);
  }

  function runDebounced(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      pushValue(value);
      const trimmed = value.trim();
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
    const value = e.target.value;
    setText(value);
    setIsOpen(true);
    runDebounced(value);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      pushValue(text);
      setIsOpen(false);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsOpen(true)}
        // Delay closing so a click on a suggestion registers before the
        // dropdown unmounts.
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        placeholder="Skin name..."
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
