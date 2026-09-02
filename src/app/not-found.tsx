import Link from "next/link";

// Replaces Next's unstyled default 404 (white Helvetica on black, no header
// or footer). This is a real user-facing path, not just a dev artifact: any
// stale or mistyped /skins/:id, /l/:slug or /combo/:encoded link lands here,
// and share links are a shipped feature - so a dead one shouldn't dump the
// visitor out of the app's design language entirely.
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-start px-4 py-24 sm:px-6 lg:px-8">
      <p className="font-display text-8xl uppercase leading-none tracking-wide text-accent">404</p>
      <h1 className="mt-2 font-display text-4xl uppercase leading-none tracking-wide">Nothing here</h1>
      <p className="mt-4 max-w-md text-sm text-muted">
        This page doesn&rsquo;t exist. If you followed a share link, it may have been revoked or the skin it
        pointed at may no longer be in our catalog.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/"
          className="clip-notch-sm bg-accent px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-accent-contrast transition-colors hover:bg-accent-dark"
        >
          Browse all skins
        </Link>
        <Link
          href="/loadouts"
          className="clip-notch-sm border border-border px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          My loadouts
        </Link>
      </div>
    </div>
  );
}
