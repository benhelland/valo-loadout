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
export async function verifyEnvironment(
  deps: {
    prisma?: Pick<PrismaClient, "environmentMarker">;
    nodeEnv?: string;
  } = {},
): Promise<void> {
  const prisma = deps.prisma ?? defaultPrisma;
  const expected = (deps.nodeEnv ?? process.env.NODE_ENV) === "production" ? "production" : "development";

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
      `[env-check] FATAL: this database self-identifies as "${marker.name}", but this process is running with ` +
        `NODE_ENV indicating "${expected}". Refusing to start - this almost always means DATABASE_URL/DIRECT_URL ` +
        `point at the wrong environment's database.`,
    );
    throw new Error(`Environment mismatch: database is "${marker.name}", process expected "${expected}".`);
  }

  console.log(`[env-check] Database environment: "${marker.name}" (matches). OK.`);
}
