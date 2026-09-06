// Creates (or re-grants) a least-privilege Postgres role for the app's
// runtime connection, separate from the owner role Prisma migrations use.
//
// Why this matters: Neon's default `*_owner` role (what DATABASE_URL/
// DIRECT_URL both used, out of the box) can do anything - DROP TABLE, ALTER,
// CREATE ROLE, the works. The running app only ever needs to read and write
// rows in tables that already exist; it never runs a migration. If the app's
// own connection string were ever leaked (a log line, a misconfigured error
// page, a dependency exfiltrating env vars), an owner-role credential lets an
// attacker do far more than an app bug could ever need to - drop the whole
// schema, not just corrupt some rows. A role scoped to SELECT/INSERT/UPDATE/
// DELETE on the app's own tables can't do either.
//
// Run once per database (dev and prod each need their own role + password -
// see the two separate DATABASE_URL values this produces). Safe to re-run:
// role creation is idempotent (skips if it exists) and the GRANTs are
// re-applied every time, which is exactly what you want after a migration
// adds a new table - see the ALTER DEFAULT PRIVILEGES clause below for why
// that specific case doesn't even need a re-run.
//
// Usage:
//   DIRECT_URL=<owner-role connection string> npx tsx src/scripts/setupAppRole.ts <role-name>
//
// Deliberately takes the owner connection via DIRECT_URL (matching
// prisma.config.ts's own convention: the owner/direct connection is for
// schema-level operations, the pooled DATABASE_URL is for the app). Prints
// the new role's connection string at the end - that's what becomes the
// new DATABASE_URL. Never logs the generated password anywhere but stdout.
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { randomBytes } from "node:crypto";

async function main() {
  const roleName = process.argv[2];
  if (!roleName) {
    console.error("Usage: npx tsx src/scripts/setupAppRole.ts <role-name>");
    console.error("Example: npx tsx src/scripts/setupAppRole.ts valo_app");
    process.exit(1);
  }
  // Role names become bare SQL identifiers below (can't be parameterised -
  // Postgres doesn't support bind parameters for identifiers). Constrained
  // to a safe character set rather than trusted, since this value reaches
  // raw SQL.
  if (!/^[a-z_][a-z0-9_]*$/.test(roleName)) {
    console.error("Role name must be lowercase letters, digits, underscores, and not start with a digit.");
    process.exit(1);
  }

  const ownerUrl = process.env.DIRECT_URL;
  if (!ownerUrl) {
    console.error("Set DIRECT_URL to the owner-role connection string for the target database.");
    process.exit(1);
  }

  const adapter = new PrismaNeon({ connectionString: ownerUrl });
  const prisma = new PrismaClient({ adapter });

  // Hex, not base64 - guarantees no characters that need escaping in either
  // a connection URL or a SQL string literal (base64's +, /, = all do).
  const password = randomBytes(24).toString("hex");

  try {
    // CREATE ROLE has no IF NOT EXISTS; this is Postgres's own documented
    // idiom for making it idempotent. ALTER ROLE afterward still updates the
    // password on a re-run, which is fine - re-running this is exactly how
    // you'd rotate the app role's own password if that were ever needed.
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${roleName}') THEN
          CREATE ROLE ${roleName} LOGIN PASSWORD '${password}';
        ELSE
          ALTER ROLE ${roleName} PASSWORD '${password}';
        END IF;
      END
      $$;
    `);

    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${roleName};`);
    await prisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${roleName};`,
    );
    // Prisma ids are cuid()/uuid() strings generated client-side, not DB
    // sequences - confirmed no @default(autoincrement()) anywhere in
    // schema.prisma - so no sequence grants are needed for inserts to work.

    // The load-bearing line for "don't need to re-run this after every
    // migration": scopes the grant to the OWNER role, not this session, so
    // any table a future `prisma migrate deploy` creates (always run as the
    // owner) is automatically covered for this app role too.
    const owner = new URL(ownerUrl).username;
    await prisma.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${roleName};`,
    );

    // Neon's pooler host is the direct host with "-pooler" appended to just
    // the first label (the endpoint id), leaving the rest of the domain
    // untouched:
    //
    //   ep-<endpoint-id>.<region>.aws.neon.tech
    //   ep-<endpoint-id>-pooler.<region>.aws.neon.tech
    //
    // Confirmed against real connection strings rather than inferred, but the
    // hosts themselves stay out of the repo - a concrete endpoint id names
    // this deployment's database, which is account detail, not source.
    const host = new URL(ownerUrl).hostname;
    const poolerHost = host.includes("-pooler") ? host : host.replace(/^([^.]+)\./, "$1-pooler.");
    const dbName = new URL(ownerUrl).pathname.replace(/^\//, "");

    console.log(`\nRole "${roleName}" ready with SELECT/INSERT/UPDATE/DELETE on all current and future public tables.\n`);
    console.log("New DATABASE_URL (pooled - use this for the app's runtime connection):");
    console.log(`  postgresql://${roleName}:${password}@${poolerHost}/${dbName}?sslmode=require\n`);
    console.log("Keep DIRECT_URL pointed at the owner role - migrations still need CREATE/ALTER/DROP.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
