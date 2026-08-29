import Link from "next/link";

// A small, deliberately secondary sub-nav between the two catalog browse
// pages - the skin gallery stays the main landing page for "Gallery" in the
// site's top nav; this just gives a way to reach the buddy gallery from
// there without promoting it to the same level.
export function GalleryTabs({ active }: { active: "skins" | "buddies" }) {
  return (
    <div className="mb-4 flex gap-5 text-xs font-semibold uppercase tracking-widest">
      <Link
        href="/"
        className={active === "skins" ? "text-foreground" : "text-muted hover:text-foreground transition-colors"}
      >
        Skins
      </Link>
      <Link
        href="/buddies"
        className={active === "buddies" ? "text-foreground" : "text-muted hover:text-foreground transition-colors"}
      >
        Buddies
      </Link>
    </div>
  );
}
