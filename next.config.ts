import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root - there's an unrelated package-lock.json one level
  // up (from other projects in this directory), which Turbopack otherwise
  // mistakes for a monorepo root.
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    // We link valorant-api.com's CDN directly rather than re-hosting their
    // assets ourselves - see docs/ARCHITECTURE.md.
    remotePatterns: [
      { protocol: "https", hostname: "media.valorant-api.com" },
      // Discord avatar images (sign-in profile picture) - see AuthControl.tsx.
      { protocol: "https", hostname: "cdn.discordapp.com" },
    ],
    // Serve valorant-api.com's images straight from their CDN rather than
    // through Next's image optimizer.
    //
    // Image optimizers meter work per unique source image per width, and this
    // catalog is far larger than that model suits: ~2,200 source images, each
    // with up to 16 candidate widths. These are already web-ready PNGs on a
    // CDN, so optimizing them adds a metered middleman for little gain.
    //
    // The tradeoff is accepted, not free: source PNGs are 38-52 KB where an
    // optimized thumbnail was ~6 KB, so gallery pages carry more bytes. Lazy
    // loading (only cards scrolled into view fetch anything) and the page-size
    // cap bound it. Re-hosting resized copies ourselves is deliberately not
    // the answer - see docs/RISKS.md on not mirroring their assets.
    unoptimized: true,
  },
};

export default nextConfig;
