import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { siteUrl } from "@/lib/siteUrl";

// Cached for a day. This is the one route that reads the whole skin table,
// and a crawler hitting it should not re-run that query every time - the
// catalog only changes when the sync job runs.
export const revalidate = 86400;

// Pointing crawlers at the canonical URLs is itself a load reduction: given a
// real list, they stop guessing at filter permutations to discover pages.
// Only the pages robots.ts allows are listed - no share links, nothing gated.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const staticPages: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/buddies`, changeFrequency: "weekly", priority: 0.6 },
  ];

  try {
    const skins = await prisma.skin.findMany({
      select: { id: true, firstSeenInSyncAt: true },
      orderBy: { displayName: "asc" },
    });
    return [
      ...staticPages,
      ...skins.map((s) => ({
        url: `${base}/skins/${s.id}`,
        lastModified: s.firstSeenInSyncAt,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      })),
    ];
  } catch {
    // A sitemap is a nicety. If the database is unreachable, serve the static
    // entries rather than failing the route and giving crawlers a 500 to
    // retry against.
    return staticPages;
  }
}
