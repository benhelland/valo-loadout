"use client";

import Image from "next/image";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CATEGORY_LABELS, categoryRank } from "@/lib/weaponOrder";

// Weapon is the primary axis people actually browse skins on ("I want a
// Vandal skin"), and it was previously the second of six visually identical
// dropdowns. Both established sites in this space lead with it instead:
// op.gg puts every weapon in a horizontal icon rail, valorantskins.com uses
// weapon-category nav. This is that rail - one click, always visible, with
// the current selection obvious rather than buried in a closed <select>.
type RailWeapon = { id: string; displayName: string; displayIconUrl: string | null; category: string | null };

export function WeaponRail({ weapons, currentWeaponId }: { weapons: RailWeapon[]; currentWeaponId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(weaponId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (weaponId) params.set("weaponId", weaponId);
    else params.delete("weaponId");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Buy-menu order (Sidearms -> SMGs -> ... -> Melee), matching the loadout
  // board's own grouping, so the two views agree on where a weapon "lives".
  const ordered = [...weapons].sort((a, b) => {
    const rank = categoryRank(a.category) - categoryRank(b.category);
    return rank !== 0 ? rank : a.displayName.localeCompare(b.displayName);
  });

  return (
    // No "All" tile: nothing selected already means all weapons, and clicking
    // the active weapon clears it (see the toggle in onClick below). Dropping
    // it also leaves exactly 20 tiles, so every breakpoint below uses a column
    // count that divides 20 and no row is left with a single hanging weapon.
    //
    // Two layouts, because the right answer differs by width.
    //
    // From `sm` up it is a wrapping grid: every weapon visible at once, two
    // rows at desktop widths, and no overflow-x scrollbar - the old single
    // row forced one that sat over the first row of skin cards and hid most
    // of the weapons behind a gesture nothing signposted.
    //
    // Below `sm` it stays a horizontal scroller. Wrapping 21 tiles at phone
    // width produces six rows about 480px tall, which pushes the first skin
    // below the fold - the same problem the collapsing filter bar exists to
    // avoid. Sideways scrolling is a natural phone gesture and its scrollbar
    // is an auto-hiding overlay there, so it costs nothing vertically.
    <div className="-mx-4 mb-4 px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-1.5 overflow-x-auto pb-1 sm:grid sm:grid-cols-5 sm:overflow-x-visible sm:pb-0 md:grid-cols-10">
        {ordered.map((weapon) => {
          const active = weapon.id === currentWeaponId;
          return (
            <button
              key={weapon.id}
              type="button"
              onClick={() => select(active ? null : weapon.id)}
              title={`${weapon.displayName}${weapon.category ? ` · ${CATEGORY_LABELS[weapon.category] ?? weapon.category}` : ""}${active ? " · click to show all weapons" : ""}`}
              className={`clip-notch-sm flex w-24 shrink-0 flex-col items-center justify-center gap-1.5 border px-2 py-2.5 transition-colors sm:w-auto sm:shrink ${
                active
                  ? "border-accent bg-accent/15 text-foreground"
                  : "border-border text-muted hover:border-foreground/30 hover:text-foreground"
              }`}
            >
              {weapon.displayIconUrl ? (
                <Image
                  src={weapon.displayIconUrl}
                  alt=""
                  width={80}
                  height={32}
                  // Weapon icons ship as light-on-transparent; dimming the
                  // inactive ones is what makes the selected one read.
                  className={`h-8 w-full max-w-20 object-contain transition-opacity ${active ? "opacity-100" : "opacity-50"}`}
                />
              ) : null}
              <span className="w-full truncate text-center text-[10px] font-semibold uppercase tracking-wider">{weapon.displayName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
