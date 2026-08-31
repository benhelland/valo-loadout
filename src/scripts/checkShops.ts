// The other trigger for the shop-check job (see also the Vercel Cron route at
// src/app/api/cron/check-shops/route.ts - both are thin wrappers around the
// same runDueShopChecks()).
//
// This one exists because Riot fronts its endpoints with Cloudflare, which is
// hardest on datacenter IPs - and every "free" scheduler in the planned stack
// (Vercel Cron, GitHub Actions) runs on exactly those. SkinPeek's own answer
// to this was "try hosting on your own PC". Running this script on a machine
// with a residential connection is the fallback if the hosted route turns out
// to be blocked. Not a workaround for bot detection - just running the job
// somewhere it isn't blocked in the first place.
//
// Usage: npm run check-shops
import { runDueShopChecks } from "@/store-check";
import { prisma } from "@/lib/db";

async function main() {
  const summary = await runDueShopChecks();
  console.log(
    `Shop checks: ${summary.attempted} due, ${summary.succeeded} succeeded, ${summary.failed} failed.` +
      (summary.failed > 0 ? " Per-account reasons are on each linked_riot_accounts row (visible on /account)." : ""),
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
