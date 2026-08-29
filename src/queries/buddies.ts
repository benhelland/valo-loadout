import { prisma } from "@/lib/db";

// A denser page size than skins (PAGE_SIZE in queries/gallery.ts) - buddy
// icons are small/low-res to begin with, so the browse grid packs more per
// row/page rather than wasting space rendering them as big as skin cards.
export const BUDDY_PAGE_SIZE = 96;

export async function listBuddiesPage(page: number | undefined) {
  const currentPage = Math.max(1, page ?? 1);

  const [buddies, total] = await Promise.all([
    prisma.buddy.findMany({
      orderBy: { displayName: "asc" },
      skip: (currentPage - 1) * BUDDY_PAGE_SIZE,
      take: BUDDY_PAGE_SIZE,
    }),
    prisma.buddy.count(),
  ]);

  return { buddies, total, page: currentPage, pageCount: Math.max(1, Math.ceil(total / BUDDY_PAGE_SIZE)) };
}
