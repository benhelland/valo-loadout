// One-time setup: plants the EnvironmentMarker row a database needs before
// src/lib/verifyEnvironment.ts's startup check has anything to compare
// against. Run once per database, right after its first migration.
//
// Usage:
//   npx tsx src/scripts/setEnvironmentMarker.ts development   # against dev's DIRECT_URL/DATABASE_URL
//   npx tsx src/scripts/setEnvironmentMarker.ts production    # against prod's
//
// Idempotent - safe to re-run (upserts the single row rather than
// duplicating it).
import { prisma } from "@/lib/db";

const VALID = ["development", "production"] as const;
type Valid = (typeof VALID)[number];

async function main() {
  const name = process.argv[2];
  if (!VALID.includes(name as Valid)) {
    console.error(`Usage: npx tsx src/scripts/setEnvironmentMarker.ts <${VALID.join("|")}>`);
    process.exit(1);
  }

  const existing = await prisma.environmentMarker.findFirst();
  if (existing) {
    await prisma.environmentMarker.update({ where: { id: existing.id }, data: { name } });
  } else {
    await prisma.environmentMarker.create({ data: { name } });
  }

  console.log(`This database now self-identifies as "${name}".`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
