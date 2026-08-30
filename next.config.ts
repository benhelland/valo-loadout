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
  },
};

export default nextConfig;
