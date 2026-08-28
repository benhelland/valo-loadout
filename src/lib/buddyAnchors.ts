// Per-weapon anchor point for overlaying a buddy charm on a skin image.
// Design constants, not user data - see docs/ARCHITECTURE.md "Buddy-on-weapon
// rendering". Percentages are relative to the weapon image's own box, so they
// work at any render size. Defaults are a starting guess; refine per-weapon
// once real images are visible in the browser.
export interface BuddyAnchor {
  xPct: number;
  yPct: number;
  scalePct: number;
}

const DEFAULT_ANCHOR: BuddyAnchor = { xPct: 60, yPct: 78, scalePct: 20 };

const WEAPON_ANCHOR_OVERRIDES: Record<string, Partial<BuddyAnchor>> = {
  // Keyed by weapon displayName - fill in as anchors get visually tuned.
};

export function getBuddyAnchor(weaponDisplayName: string | null | undefined): BuddyAnchor {
  const override = weaponDisplayName ? WEAPON_ANCHOR_OVERRIDES[weaponDisplayName] : undefined;
  return { ...DEFAULT_ANCHOR, ...override };
}
