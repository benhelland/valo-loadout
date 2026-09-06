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
// It used to live only in instrumentation's register(), which Next calls when
// a *server* boots. `next build` does not boot a server - it renders in build
// workers - so register() never fires during a build, and the check was
// simply absent there. That is precisely where it was needed: on 2026-09-06 a
// local `.env.production.local` (auto-loaded by Next during any build, at
// higher precedence than .env.local) pointed `npm run build` at the
// production database, and src/app/sitemap.ts queried it. Nothing objected,
// because the only guard in the codebase was not running.
//
// Attaching it here fixes the class rather than that one instance. Every path
// that reaches the database - dev server, build, `next start`, and the tsx
// scripts (sync, check-shops) - obtains its client from this module, so all
// of them are now covered by construction. A guard that a routine command can
// bypass entirely is not a guard.
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
