"use client";

import Image from "next/image";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CATEGORY_LABELS, categoryRank } from "@/lib/weaponOrder";
import type { Weapon } from "@/generated/prisma/client";

// Weapon is the primary axis people actually browse skins on ("I want a
// Vandal skin"), and it was previously the second of six visually identical
// dropdowns. Both established sites in this space lead with it instead:
// op.gg puts every weapon in a horizontal icon rail, valorantskins.com uses
// weapon-category nav. This is that rail - one click, always visible, with
// the current selection obvious rather than buried in a closed <select>.
export function WeaponRail({ weapons, currentWeaponId }: { weapons: Weapon[]; currentWeaponId?: string }) {
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
    <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max items-stretch gap-1.5">
        <button
          type="button"
          onClick={() => select(null)}
          className={`clip-notch-sm shrink-0 px-4 text-[11px] font-bold uppercase tracking-widest transition-colors ${
            currentWeaponId
              ? "border border-border text-muted hover:border-foreground/30 hover:text-foreground"
              : "border border-accent bg-accent/15 text-foreground"
          }`}
        >
          All
        </button>

        {ordered.map((weapon) => {
          const active = weapon.id === currentWeaponId;
          return (
            <button
              key={weapon.id}
              type="button"
              onClick={() => select(active ? null : weapon.id)}
              title={`${weapon.displayName}${weapon.category ? ` · ${CATEGORY_LABELS[weapon.category] ?? weapon.category}` : ""}`}
              className={`clip-notch-sm flex shrink-0 flex-col items-center gap-1 border px-3 py-2 transition-colors ${
                active
                  ? "border-accent bg-accent/15 text-foreground"
                  : "border-border text-muted hover:border-foreground/30 hover:text-foreground"
              }`}
            >
              {weapon.displayIconUrl ? (
                <Image
                  src={weapon.displayIconUrl}
                  alt=""
                  width={56}
                  height={20}
                  // Weapon icons ship as light-on-transparent; dimming the
                  // inactive ones is what makes the selected one read.
                  className={`h-5 w-14 object-contain transition-opacity ${active ? "opacity-100" : "opacity-50"}`}
                />
              ) : null}
              <span className="text-[10px] font-semibold uppercase tracking-wider">{weapon.displayName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
