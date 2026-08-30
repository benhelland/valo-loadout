import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";
import { safeReturnTo } from "@/lib/safeReturnTo";

// Discord-only, matching docs/ARCHITECTURE.md - no password form of our own
// to build or secure. callbackUrl comes from middleware.ts's automatic
// redirect (it appends ?callbackUrl=<original path> before landing here) or
// from a direct link into this page; validated the same way the buddy
// picker's returnTo already is (src/lib/safeReturnTo.ts) since it's
// attacker-controllable and an unchecked value here is an open-redirect
// vector, same class of issue as that one.
// Auth.js's own proxy-driven redirect (src/proxy.ts, via the "authorized"
// callback) builds callbackUrl as an ABSOLUTE URL ("http://host/loadouts"),
// not a path - safeReturnTo alone would reject that (by design, it only
// accepts relative paths) and silently fall back to the default every time,
// losing exactly where the user was headed. Rather than loosen safeReturnTo
// itself (shared with the buddy picker's returnTo, which only ever produces
// relative paths - a wider contract there is more surface, not less), strip
// the callbackUrl down to just its pathname+search first: parsing it against
// a throwaway base means any origin/host it carried (real or attacker-
// supplied, e.g. "https://evil.example/x") is discarded entirely before
// safeReturnTo ever sees it, so the result is unconditionally same-origin
// regardless of input.
function toSafePath(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, "http://placeholder.invalid");
    return safeReturnTo(url.pathname + url.search);
  } catch {
    return null;
  }
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const sp = await searchParams;
  const rawCallback = Array.isArray(sp.callbackUrl) ? sp.callbackUrl[0] : sp.callbackUrl;
  const callbackUrl = toSafePath(rawCallback) ?? "/loadouts";

  // Already signed in and landed here anyway (e.g. via a stale link) -
  // just continue on rather than showing a sign-in screen to someone
  // who doesn't need one.
  const session = await auth();
  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <div className="clip-notch w-full border border-border bg-surface p-8">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Sign in</p>
        <h1 className="mt-2 font-display text-4xl uppercase tracking-wide leading-none">
          Build a <span className="text-accent">loadout</span>
        </h1>
        <p className="mt-4 text-sm text-muted">
          Browsing the gallery never requires an account. Signing in with Discord is only needed to save
          loadouts and (later) link a Riot account for shop notifications.
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("discord", { redirectTo: callbackUrl });
          }}
          className="mt-8"
        >
          <button
            type="submit"
            className="clip-notch-sm flex w-full items-center justify-center gap-3 bg-[#5865F2] px-6 py-3 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#4752C4]"
          >
            <DiscordIcon />
            Continue with Discord
          </button>
        </form>

        <p className="mt-6 text-[11px] text-muted">
          We only ever see your Discord username and avatar - never your password, never your messages.
        </p>
      </div>
    </div>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
      <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.246.195.373.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028ZM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.311-.956 2.38-2.157 2.38Zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.311-.947 2.38-2.157 2.38Z" />
    </svg>
  );
}
