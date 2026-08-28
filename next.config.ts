import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root - there's an unrelated package-lock.json one level
  // up (from other projects in this directory), which Turbopack otherwise
  // mistakes for a monorepo root.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
