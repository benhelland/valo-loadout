import type { Metadata } from "next";
import { Bebas_Neue, Rajdhani } from "next/font/google";
import { AuthControl } from "@/components/auth/AuthControl";
import { MainNav } from "@/components/nav/MainNav";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
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
  title: "Valoadout",
  description: "Build your ideal VALORANT loadout, browse every skin, and get notified when one hits your shop.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${rajdhani.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Sticky: the gallery scrolls for a long way, and losing the nav
            offscreen is the main thing that makes a long list feel dated.
            Already translucent with a backdrop blur, so it reads as a layer
            over the content rather than a bar bolted on. */}
        <header className="sticky top-0 z-40 border-b-2 border-accent/30 bg-surface/80 backdrop-blur">
          <MainNav authControl={<AuthControl />} />
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-border">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 text-xs text-muted">
            <p>
              Valoadout is not affiliated with or endorsed by Riot Games, Inc. VALORANT and all
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

        {/* Page-view counts only, no cookies and no cross-site tracking. It
            exists to answer "is anyone actually using this, and are they
            coming back" - the question that otherwise needs reading raw
            deployment logs to guess at. */}
        <Analytics />

        {/* Real Experience Score from actual visits, rather than a synthetic
            score from a lab run. Free on this plan and incapable of billing:
            the allowance is 10,000 events per 30 days, and exceeding it pauses
            collection for 14 days rather than charging for the overage. The
            paid tier that does bill per event is a separate product that
            cannot be enabled here. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
