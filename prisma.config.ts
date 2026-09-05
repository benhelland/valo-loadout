import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

config({ path: ".env.local" });

// The CLI (migrate, db push, studio) uses the direct connection.
// The app itself uses the pooled DATABASE_URL - see src/lib/db.ts.
//
// The datasource is declared only when DIRECT_URL actually exists, because
// `env()` throws on a missing variable and that breaks builds that never
// needed a database at all. `prisma generate` runs during every deployment
// build (see package.json) and only reads the schema file - migrate, studio
// and db push are the commands that need a live connection, and those only
// ever run locally.
//
// This is deliberate rather than incidental: DIRECT_URL is the owner-role
// credential, and deployment environments intentionally don't carry it. The
// running app connects as a least-privilege role that cannot alter the
// schema (docs/RISKS.md). Adding DIRECT_URL to a hosting provider to make a
// build pass would quietly hand every deployment DDL rights over the
// production database - fix the build, not the privilege boundary.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(process.env.DIRECT_URL ? { datasource: { url: env("DIRECT_URL") } } : {}),
});
