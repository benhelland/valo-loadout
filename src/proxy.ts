import { NextResponse, type NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { isProtected } from "@/lib/protectedPaths";
import {
  BYPASS_COOKIE,
  BYPASS_PARAM,
  MAINTENANCE_RETRY_AFTER_SECONDS,
  MAINTENANCE_STATUS,
  bypassSecret,
  isMaintenanceEnabled,
  isValidBypass,
  maintenanceHtml,
} from "@/lib/maintenance";

// Next.js 16 renamed the "middleware" file convention to "proxy" (same
// mechanism - runs before routes render - just a clearer name; see
// https://nextjs.org/docs/messages/middleware-to-proxy). Uses the
// lightweight auth.config.ts (no PrismaAdapter, no Discord secret) so route
// protection is a pure JWT-cookie check - no DB round-trip on every
// navigation. src/auth.ts (the full config, DB-backed) is never imported
// here.
const { auth } = NextAuth(authConfig);

// `auth` is used here exactly as Auth.js documents for middleware
// (`export { auth as middleware }`), which is what this file did before
// maintenance mode existed - it was assigned straight to the proxy export, so
// Next.js has always called it with (NextRequest, NextFetchEvent).
//
// The cast is a type-level escape hatch only. `auth` is overloaded for three
// call shapes, and calling it explicitly makes TypeScript resolve one of the
// non-middleware ones (the Pages-router or App-Route handler signature)
// instead of the middleware one; there is no overload that accepts
// NextFetchEvent. Runtime behaviour is unchanged from the previous
// `export const proxy = auth`.
type ProxyHandler = (req: NextRequest, event: NextFetchEvent) => unknown;
const authProxy = auth as unknown as ProxyHandler;

// Gallery/buddy browsing stays fully open to anonymous visitors, per explicit
// product decision - only the loadout builder and the account/notification
// area require signing in.
//
// Protected-path matching lives in src/lib/protectedPaths.ts so it can be
// tested without loading next-auth or the Edge-runtime proxy machinery. The
// matcher below is deliberately broad because maintenance mode has to answer
// *every* path, so that decision cannot be expressed in `config.matcher`. The
// `authorized` callback in auth.config.ts redirects anyone without a session,
// so running Auth.js on public paths would lock anonymous visitors out of the
// gallery - hence the explicit test rather than letting it see everything.

function maintenanceResponse(): NextResponse {
  return new NextResponse(maintenanceHtml(), {
    status: MAINTENANCE_STATUS,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "retry-after": String(MAINTENANCE_RETRY_AFTER_SECONDS),
      // Never let a CDN or browser hold on to the notice - a cached 503 would
      // outlive the maintenance window and keep showing it after the switch
      // is turned back off.
      "cache-control": "no-store, must-revalidate",
    },
  });
}

/**
 * Handles maintenance mode first, then delegates to Auth.js only for the
 * protected paths. Split into a named function (rather than the documented
 * `export const { auth: proxy }` destructuring) because Next.js 16's
 * build-time "does this file export a proxy function" check does not see
 * through that re-export and fails the build even though the value genuinely
 * is a function.
 */
export function proxy(req: NextRequest, event: NextFetchEvent) {
  if (isMaintenanceEnabled()) {
    const secret = bypassSecret();
    // URLSearchParams applies form decoding, which turns "+" into a space.
    // Base64 secrets contain "+" routinely, so the value read back would not
    // match what was pasted into the URL, and the bypass would silently fail
    // for a large share of generated secrets. The documented generator now
    // emits a URL-safe alphabet; restoring the character here keeps any secret
    // generated before that from being locked out.
    const rawQuery = req.nextUrl.searchParams.get(BYPASS_PARAM) ?? undefined;
    const fromQuery = rawQuery?.includes(" ") ? rawQuery.replace(/ /g, "+") : rawQuery;
    const fromCookie = req.cookies.get(BYPASS_COOKIE)?.value;

    // Fails closed: with no secret configured, nothing gets through.
    if (!secret) return maintenanceResponse();

    if (isValidBypass(fromQuery, secret)) {
      // Remember it, so the rest of the session doesn't need the query string
      // on every navigation. Redirect strips the secret back out of the URL so
      // it stops appearing in the address bar, history and any referrer.
      const url = req.nextUrl.clone();
      url.searchParams.delete(BYPASS_PARAM);
      const res = NextResponse.redirect(url);
      res.cookies.set(BYPASS_COOKIE, secret, {
        httpOnly: true,
        sameSite: "lax",
        secure: req.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 60 * 60 * 12,
      });
      return res;
    }

    if (!isValidBypass(fromCookie, secret)) return maintenanceResponse();
    // Valid bypass cookie - fall through and serve the site normally.
  }

  if (!isProtected(req.nextUrl.pathname)) return NextResponse.next();
  return authProxy(req, event);
}

// Broad on purpose - maintenance mode must be able to answer any path.
// Everything excluded here is either served before the proxy runs or would
// make the maintenance page unable to render:
//   _next/static, _next/image - build output and the image loader
//   favicon.ico, icon.svg, robots.txt - static, and robots.txt's route reads
//     no data
// The maintenance page itself is self-contained HTML with inline styles, so
// blocking asset paths during an outage costs it nothing.
//
// sitemap.xml is deliberately NOT excluded, despite looking like a static file
// alongside robots.txt: it is a route that queries the whole skin table, and it
// revalidates daily. Excluding it would let a crawler wake the database during
// a maintenance window, contradicting the one property this feature exists for.
// A 503 with Retry-After is the right answer to a crawler mid-window anyway.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
