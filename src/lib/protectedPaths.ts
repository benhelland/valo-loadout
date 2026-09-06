// Which routes require a signed-in user.
//
// Kept in its own module, separate from src/proxy.ts, so it can be tested
// without pulling in next-auth and the Edge-runtime proxy machinery. Prefix
// matching written by hand is easy to get subtly wrong - "/loadouts-public"
// must not match "/loadouts" - so the boundary is pinned by tests rather than
// left to reading.
//
// Gallery and buddy browsing stay fully open to anonymous visitors, per
// explicit product decision; only the loadout builder and the account /
// notification area require signing in.
//
// Add new protected sections here. As defense in depth, getCurrentUserId()
// (src/lib/auth.ts) independently verifies the session too, in case this list
// ever drifts out of sync with a new call site. Per Next.js's own docs, Server
// Actions are POSTs to the route where they are used rather than separate
// routes, so covering a page also covers every action called from it.
export const PROTECTED_PREFIXES = ["/loadouts", "/account", "/wishlist", "/shop"] as const;

/**
 * True when `pathname` is the protected section itself or something beneath
 * it. Matches "/loadouts" and "/loadouts/abc" but not "/loadouts-public",
 * which is a different route and must stay public.
 */
export function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
