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
    // Next 16 requires every quality value used anywhere to be declared here.
    // 60 is for gallery thumbnails: a card renders a ~256px-wide image, where
    // the difference from the default 75 is not visible but the transfer is
    // meaningfully smaller. A gallery page requests one image per card, and
    // that download volume - not painting - is what makes scrolling stutter.
    qualities: [60, 75],
  },
};

export default nextConfig;
