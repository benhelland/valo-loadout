import { redirect } from "next/navigation";
import { auth } from "@/auth";

// The single place any query/action reads "who's logged in" - every loadout
// (and, going forward, account/notification) query or action calls this
// instead of touching the session directly, so auth logic never has to be
// re-implemented per call site.
//
// middleware.ts already redirects unauthenticated requests away from every
// protected path (/loadouts/*, /account/*) before a page or action ever
// runs - the redirect() call below is a deliberate second layer, not
// redundant. It's what actually protects a server action if it's ever
// called from somewhere middleware doesn't cover (a bug in the matcher, a
// future call site added outside those paths), so a mistake there fails
// closed (bounce to sign-in) instead of silently running as no one / a
// stale mock user. redirect() is safe to call from both Server Components
// and Server Actions - Next.js handles the special thrown signal in either
// context, as long as nothing here wraps this call in try/catch (none of
// the current call sites in src/actions/loadouts.ts do).
export async function getCurrentUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/sign-in");
  }
  return userId;
}

// For places that want to render differently when signed out instead of
// forcing a redirect (e.g. the header's sign-in/account control) - returns
// null rather than bouncing, unlike getCurrentUserId().
export async function getOptionalUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
