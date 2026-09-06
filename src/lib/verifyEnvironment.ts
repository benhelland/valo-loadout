import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Thrown when this process reached the wrong database.
 *
 * A distinct class because callers legitimately swallow database errors -
 * src/app/sitemap.ts treats an unreachable database as "serve the static
 * entries" rather than failing the build, which is right for an outage and
 * wrong for this. Without a way to tell the two apart, a bare `catch` turns
 * the guard into a log line in a passing build, which is how a mistake this
 * check exists to prevent still ships.
 */
export class EnvironmentMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvironmentMismatchError";
  }
}

/** Type guard for catch blocks that must re-throw rather than swallow. */
export function isEnvironmentMismatch(err: unknown): err is EnvironmentMismatchError {
  return err instanceof EnvironmentMismatchError;
}

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
// NODE_ENV must never be able to select the production database on its own.
// It means "this is an optimized build", not "this process belongs on the
// production database" - `next build` and `next start` set it on a developer
// machine just as readily as on a deployment. The question that matters is
// "is this process actually running on the deployment platform?", and only
// VERCEL_ENV answers it, so off-platform the expected marker is "development"
// whatever NODE_ENV says.
//
// This matters because env files can supply production credentials locally.
// Next auto-loads `.env.<NODE_ENV>.local` at higher precedence than
// `.env.local` during any build, so a file named for an environment can put
// that environment's DATABASE_URL in front of a local build without anything
// being typed on the command line.
//
// A local process may reach the production database only with
// ALLOW_PRODUCTION_DB_LOCALLY=1, deliberately absent from .env.example so it
// cannot be filled in by habit.
//
// Both dependencies are injectable so this can be unit-tested without a live
// database (src/lib/verifyEnvironment.test.ts), the same pattern used for
// src/lib/authAdapter.ts.
//
// `prisma` is required rather than defaulting to the shared client: src/lib/db.ts
// imports this module to run the check on its query path, so defaulting here
// would make the two files import each other. The one caller passes the
// unextended client explicitly, which also keeps the check from recursing
// through the extension that invokes it.

// Which marker this process should be reading back.
//
// NODE_ENV alone is not enough on Vercel: it is "production" for BOTH real
// production deployments and preview deployments, so a preview pointed at
// the dev database would be judged a mismatch and refuse to boot. VERCEL_ENV
// is the value that actually distinguishes the three.
//
// Only "production" maps to the production database. Preview deployments are
// expected to run against the dev database, which means this still catches
// the inverse and more dangerous mistake - a preview wired to production,
// where a feature branch would write to real user data.
//
// Off Vercel the answer is "development" whatever NODE_ENV says - see the
// blind-spot note in the module doc above. `nodeEnv` is still taken so the
// caller reports what it saw, but it deliberately cannot select the
// production database on its own.
export function expectedMarkerFor(
  vercelEnv: string | undefined,
  nodeEnv: string | undefined,
  allowProductionDbLocally = false,
): string {
  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview" || vercelEnv === "development") return "development";

  // Not a deployment: a developer machine, or CI. `next build` and
  // `next start` both set NODE_ENV=production here, which says nothing about
  // which database is appropriate.
  void nodeEnv;
  return allowProductionDbLocally ? "production" : "development";
}

/** True when this process is running on the deployment platform at all. */
export function isDeployed(vercelEnv: string | undefined): boolean {
  return vercelEnv === "production" || vercelEnv === "preview" || vercelEnv === "development";
}

export async function verifyEnvironment(
  deps: {
    prisma: Pick<PrismaClient, "environmentMarker">;
    nodeEnv?: string;
    vercelEnv?: string;
    allowProductionDbLocally?: boolean;
  },
): Promise<void> {
  const prisma = deps.prisma;
  const vercelEnv = deps.vercelEnv ?? process.env.VERCEL_ENV;
  const nodeEnv = deps.nodeEnv ?? process.env.NODE_ENV;
  const allowLocal =
    deps.allowProductionDbLocally ?? process.env.ALLOW_PRODUCTION_DB_LOCALLY === "1";
  const expected = expectedMarkerFor(vercelEnv, nodeEnv, allowLocal);

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

  // Named separately from the generic mismatch below because the generic
  // message ("expected development") is actively misleading here: the cause
  // is not a wrong connection string but a local process reaching the live
  // database at all, usually because an env file supplied production
  // credentials to `next build`. Saying that outright is the difference
  // between a five-minute fix and an afternoon.
  if (marker.name === "production" && !isDeployed(vercelEnv) && !allowLocal) {
    console.error(
      `[env-check] FATAL: this process is NOT running on the deployment platform ` +
        `(VERCEL_ENV is unset, NODE_ENV is "${nodeEnv}") but the database it reached ` +
        `self-identifies as "production". Refusing to start.\n` +
        `A local build or server must never touch the live database. NODE_ENV=production ` +
        `means "optimized build", not "production database" - \`next build\` and \`next start\` ` +
        `set it locally too.\n` +
        `Most likely an env file is supplying the production DATABASE_URL. Note that Next ` +
        `auto-loads .env.production.local during ANY build, at higher precedence than ` +
        `.env.local.\n` +
        `If this really is intended, set ALLOW_PRODUCTION_DB_LOCALLY=1 for this one command.`,
    );
    throw new EnvironmentMismatchError(
      "Environment mismatch: a local process reached the production database. " +
        "Set ALLOW_PRODUCTION_DB_LOCALLY=1 only if that is genuinely intended.",
    );
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
    throw new EnvironmentMismatchError(
      `Environment mismatch: database is "${marker.name}", process expected "${expected}".`,
    );
  }

  if (allowLocal && !isDeployed(vercelEnv) && marker.name === "production") {
    // Loud on every start, deliberately. An escape hatch set once and
    // forgotten is how the original problem happened; this makes leaving it
    // on impossible to overlook.
    console.warn(
      `[env-check] WARNING: connected to the PRODUCTION database from a local process, ` +
        `permitted only because ALLOW_PRODUCTION_DB_LOCALLY=1. Unset it when finished.`,
    );
    return;
  }

  console.log(`[env-check] Database environment: "${marker.name}" (matches). OK.`);
}
