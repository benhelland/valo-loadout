import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Next.js 16 renamed the "middleware" file convention to "proxy" (same
// mechanism - runs before routes render - just a clearer name; see
// https://nextjs.org/docs/messages/middleware-to-proxy). Uses the
// lightweight auth.config.ts (no PrismaAdapter, no Discord secret) so route
// protection is a pure JWT-cookie check - no DB round-trip on every
// navigation. src/auth.ts (the full config, DB-backed) is never imported
// here.
//
// Split into two statements on purpose. Auth.js's own documented pattern is
// `export const { auth: proxy } = NextAuth(authConfig)` - that works fine at
// runtime, but Next.js 16's build-time check for "does this file export a
// proxy function" doesn't see through that destructuring re-export and fails
// the build ("must export a function... as a named 'proxy' export"), even
// though the exported value genuinely is a function. Naming it in its own
// `export const proxy = ...` statement satisfies that check.
const { auth } = NextAuth(authConfig);
export const proxy = auth;

// Gallery/buddy browsing stays fully open to anonymous visitors, per
// explicit product decision - only the loadout builder and the account/
// notification-linking area require signing in. Add new protected sections
// here, not by scattering auth checks through individual pages. Per
// Next.js's own docs: Server Actions are handled as POST requests to the
// route where they're used, not separate routes, so a matcher that covers
// a page also covers every action called from it - but as defense in depth,
// getCurrentUserId() (src/lib/auth.ts) independently verifies the session
// too, in case a matcher ever drifts out of sync with a new call site.
export const config = {
  matcher: ["/loadouts/:path*", "/account/:path*", "/wishlist/:path*", "/shop/:path*"],
};
