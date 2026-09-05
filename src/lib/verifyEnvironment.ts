import { prisma as defaultPrisma } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";

// Catches "this process is pointed at the wrong database" - the one failure
// mode dev/prod separation can't structurally prevent, since there's no
// shared infrastructure to misconfigure, only a connection string a human
// (or a copy-pasted .env file) could put in the wrong place.
//
// Deliberately does NOT parse, hash, or otherwise touch DATABASE_URL. Every
// value this file can log or throw is one of exactly two literals,
// "development" or "production" - the only values setEnvironmentMarker.ts
// ever writes. Since it never reads the connection string at all, no code
// path here can leak a hostname or credential.
//
// The two signals compared are independent, which is what makes this a real
// check rather than a circular one: NODE_ENV is set by tooling (`next dev`
// vs. a real build), never typed into an env file, so it can't be
// copy-paste-mismatched the way DATABASE_URL can. The EnvironmentMarker row
// lives IN the database, so it travels with the database rather than with
// whatever connection string points at it - pointed at the wrong database,
// the row read back is still that database's own answer.
//
// Both dependencies are injectable so this can be unit-tested without a live
// database (src/lib/verifyEnvironment.test.ts), the same pattern used for
// src/lib/authAdapter.ts.
// Which marker this process should be reading back.
//
// NODE_ENV alone is not enough on Vercel: it is "production" for BOTH real
// production deployments and preview deployments, so a preview pointed at
// the dev database would be judged a mismatch and refuse to boot. VERCEL_ENV
// is the value that actually distinguishes the three, so prefer it and fall
// back to NODE_ENV everywhere else (local dev, CI, `npm run check-shops`).
//
// Only "production" maps to the production database. Preview deployments are
// expected to run against the dev database, which means this still catches
// the inverse and more dangerous mistake - a preview wired to production,
// where a feature branch would write to real user data.
export function expectedMarkerFor(vercelEnv: string | undefined, nodeEnv: string | undefined): string {
  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview" || vercelEnv === "development") return "development";
  return nodeEnv === "production" ? "production" : "development";
}

export async function verifyEnvironment(
  deps: {
    prisma?: Pick<PrismaClient, "environmentMarker">;
    nodeEnv?: string;
    vercelEnv?: string;
  } = {},
): Promise<void> {
  const prisma = deps.prisma ?? defaultPrisma;
  const expected = expectedMarkerFor(
    deps.vercelEnv ?? process.env.VERCEL_ENV,
    deps.nodeEnv ?? process.env.NODE_ENV,
  );

  const marker = await prisma.environmentMarker.findFirst();

  if (!marker) {
    // A brand-new database, migrated but not yet marked - not a failure,
    // since there's nothing yet to contradict. Loud enough to not be missed,
    // but doesn't block startup: forcing a marker to exist would make this
    // migration's own first deploy a chicken-and-egg problem.
    console.warn(
      `[env-check] No environment marker found. If this is a fresh database, run: ` +
        `npx tsx src/scripts/setEnvironmentMarker.ts ${expected}`,
    );
    return;
  }

  if (marker.name !== expected) {
    // Deliberately thrown, not just logged - see the module doc for why a
    // silent mismatch here is exactly the "data got jumbled" failure mode
    // this exists to catch. Crashing on cold start is the correct
    // consequence: no request should be served against the wrong database.
    console.error(
      `[env-check] FATAL: this database self-identifies as "${marker.name}", but this process expected ` +
        `"${expected}". Refusing to start - this almost always means DATABASE_URL points at the wrong ` +
        `environment's database. A preview deployment is expected to use the development database; only a ` +
        `production deployment should reach the production one.`,
    );
    throw new Error(`Environment mismatch: database is "${marker.name}", process expected "${expected}".`);
  }

  console.log(`[env-check] Database environment: "${marker.name}" (matches). OK.`);
}
