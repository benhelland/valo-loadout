import type { Metadata } from "next";
import Link from "next/link";
import { Bebas_Neue, Rajdhani } from "next/font/google";
import { AuthControl } from "@/components/auth/AuthControl";
import "./globals.css";

// Display font for big headers - the closest free stand-in for the VALORANT
// client's condensed "Tungsten" typeface.
const bebasNeue = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
});

// UI/body font - a squared-off, tactical-feeling grotesque in the spirit of
// the client's "DIN Next" body copy.
const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "valo-loadout",
  description: "Build your ideal VALORANT loadout, browse every skin, and get notified when one hits your shop.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${rajdhani.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="border-b-2 border-accent/30 bg-surface/80 backdrop-blur">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
            <Link href="/" className="font-display text-3xl uppercase tracking-wide leading-none">
              valo<span className="text-accent">loadout</span>
            </Link>
            <div className="flex items-center gap-8">
              <nav className="flex items-center gap-8 text-sm font-semibold uppercase tracking-widest text-muted">
                <Link
                  href="/"
                  className="border-b-2 border-transparent pb-1 hover:border-accent hover:text-foreground transition-colors"
                >
                  Gallery
                </Link>
                <Link
                  href="/loadouts"
                  className="border-b-2 border-transparent pb-1 hover:border-accent hover:text-foreground transition-colors"
                >
                  Loadouts
                </Link>
                <Link
                  href="/wishlist"
                  className="border-b-2 border-transparent pb-1 hover:border-accent hover:text-foreground transition-colors"
                >
                  Wishlist
                </Link>
              </nav>
              <AuthControl />
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-border">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 text-xs text-muted">
            <p>
              valo-loadout is not affiliated with or endorsed by Riot Games, Inc. VALORANT and all
              associated logos, names, and assets are trademarks or registered trademarks of Riot
              Games, Inc.
            </p>
            <p className="mt-1">
              Skin and cosmetic data courtesy of{" "}
              <a
                href="https://valorant-api.com"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                valorant-api.com
              </a>
              , an unofficial community project.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
