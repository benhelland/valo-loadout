import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "valo-loadout",
  description: "Build your ideal VALORANT loadout, browse every skin, and get notified when one hits your shop.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="border-b border-border">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              valo<span className="text-accent">loadout</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm text-muted">
              <Link href="/" className="hover:text-foreground transition-colors">
                Gallery
              </Link>
            </nav>
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
