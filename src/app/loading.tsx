// Shown while a server-rendered route is being prepared. Without this, a
// click produced no feedback at all until the whole page arrived - on a
// database-backed page that reads as an unresponsive app rather than a
// loading one.
//
// Deliberately generic: this file also covers nested routes that do not
// define their own, so it must not look like a skeleton of one specific page.
// Pure CSS animation, no JavaScript.
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <div className="relative h-10 w-10">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent/30" />
        <span className="absolute inset-[6px] rounded-full bg-accent" />
      </div>
      <p className="font-display text-lg uppercase tracking-widest text-muted">Loading</p>
    </div>
  );
}
