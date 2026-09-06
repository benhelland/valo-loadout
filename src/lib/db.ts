import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { verifyEnvironment } from "@/lib/verifyEnvironment";

// Reuse the client across hot reloads in dev so we don't exhaust connections.
const globalForPrisma = globalThis as unknown as {
  prisma?: ExtendedPrismaClient;
  prismaVerification?: Promise<void>;
};

function createClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// The unextended client. Used for exactly one thing: reading the environment
// marker in the check below. Going through the extended client for that read
// would recurse, since the check is what the extension runs.
const baseClient = createClient();

/**
 * Runs the environment check once per process, memoised on the promise so
 * concurrent first queries all await the same read rather than racing.
 *
 * Exported so the startup hook can await the same single check instead of
 * performing its own duplicate one.
 */
export function ensureEnvironmentVerified(): Promise<void> {
  globalForPrisma.prismaVerification ??= verifyEnvironment({ prisma: baseClient });
  return globalForPrisma.prismaVerification;
}

// Why the check hangs off the query path rather than src/instrumentation.ts.
//
// instrumentation's register() runs when a *server* boots. `next build` does
// not boot a server - it renders in build workers - so a check placed there
// does not run during a build. Builds do reach the database
// (src/app/sitemap.ts queries it to enumerate skin URLs), so that is a path
// the check has to cover.
//
// Attaching it to the query path covers the class rather than one entry
// point. Every path that reaches the database - dev server, build, `next
// start`, and the tsx scripts (sync, check-shops) - obtains its client from
// this module, so all of them are covered by construction. A guard a routine
// command can bypass is not a guard.
//
// Cost is one await on an already-resolved promise per query after the first.
const extended = baseClient.$extends({
  query: {
    async $allOperations({ args, query }) {
      await ensureEnvironmentVerified();
      return query(args);
    },
  },
});

type ExtendedPrismaClient = typeof extended;

export const prisma: ExtendedPrismaClient = globalForPrisma.prisma ?? extended;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
