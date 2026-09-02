"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Gallery" },
  { href: "/loadouts", label: "Loadouts" },
  { href: "/wishlist", label: "Wishlist" },
];

// The header used to be a single non-wrapping flex row. With three nav items
// it overflowed the viewport on phones - the whole document scrolled
// sideways (measured: 502px of content in a 375px viewport) and "Wishlist"
// was simply off-screen with no way to reach it. Links collapse into a
// toggle below the md breakpoint instead.
//
// `authControl` is passed in as a node rather than imported, because the
// real control (src/components/auth/AuthControl.tsx) is an async server
// component that reads the session - it can't be imported into a client
// component, but it can be rendered by the server and handed down as a prop.
export function MainNav({ authControl }: { authControl: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  function linkClass(href: string): string {
    // "/" would prefix-match every route, so the gallery is an exact match.
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return active
      ? "border-b-2 border-accent pb-1 text-foreground"
      : "border-b-2 border-transparent pb-1 text-muted hover:border-border hover:text-foreground transition-colors";
  }

  return (
    <>
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="shrink-0 font-display text-3xl uppercase leading-none tracking-wide">
          valo<span className="text-accent">loadout</span>
        </Link>

        <div className="flex items-center gap-8">
          <nav className="hidden items-center gap-8 text-sm font-semibold uppercase tracking-widest md:flex">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={linkClass(link.href)}>
                {link.label}
              </Link>
            ))}
          </nav>

          {authControl}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="flex h-9 w-9 shrink-0 items-center justify-center border border-border text-foreground transition-colors hover:border-accent md:hidden"
          >
            {/* Two-then-one bar swap rather than an icon font/library - this
                is the only icon in the header and doesn't justify a dep. */}
            <span className="relative block h-3 w-4">
              <span
                className={`absolute left-0 block h-0.5 w-4 bg-current transition-transform ${
                  open ? "top-1.5 rotate-45" : "top-0"
                }`}
              />
              <span className={`absolute left-0 top-1.5 block h-0.5 w-4 bg-current ${open ? "opacity-0" : ""}`} />
              <span
                className={`absolute left-0 block h-0.5 w-4 bg-current transition-transform ${
                  open ? "top-1.5 -rotate-45" : "top-3"
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      {open ? (
        <nav className="border-t border-border md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col px-4 sm:px-6 lg:px-8">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="border-b border-border py-4 text-sm font-semibold uppercase tracking-widest text-muted last:border-b-0 hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </>
  );
}
