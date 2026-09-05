import { prisma as defaultPrisma } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";

// Catches "this process is pointed at the wrong database" - the one failure
// mode dev/prod separation can't structurally prevent, since there's no
// shared infrastructure to misconfigure, only a connection string a human
// (or a copy-pasted .env file) could put in the wrong place.
//
// Deliberately does NOT parse, hash, or otherwise touch DATABASE_URL. Every
// value this file can ever log or throw is one of exactly three: the literal
// words "development", "production", and whatever `name` a future
// EnvironmentMarker row happens to hold - itself always one of those first
// two by construction (see src/scripts/setEnvironmentMarker.ts, the only
// thing that ever writes it). There is no code path here capable of leaking
// a hostname, a credential, or anything derived from the connection string,
// because it never reads that variable at all - this is a structural
// property of the design, not a promise about how carefully it's written.
//
// The two signals compared come from genuinely independent places, which is
// what makes this a real check rather than a circular one: NODE_ENV is set
// by tooling (`next dev` vs. a real build), never typed by a human into an
// env file, so it can't be copy-paste-mismatched the way DATABASE_URL can.
// The EnvironmentMarker row lives IN the database, planted once, so it
// travels with the database rather than with whatever connection string
// currently points at it - if DATABASE_URL is ever pointed at the wrong
// database, the row read back is still that database's real answer.
// Both dependencies are injectable, defaulting to the real ones - purely so
// this can be unit-tested (src/lib/verifyEnvironment.test.ts) without a live
// database, the same pattern already used for src/lib/authAdapter.ts.
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
