import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { fuzzyScore } from "@/lib/fuzzyMatch";
import { DEFAULT_BUDDY_PAGE_SIZE } from "@/lib/pageSize";

export const BUDDY_PAGE_SIZE = DEFAULT_BUDDY_PAGE_SIZE;

export interface BuddyFilters {
  search?: string;
  color?: string;
  page?: number;
  // Must already be validated - see resolvePageSize in src/lib/pageSize.ts.
  pageSize?: number;
}

export async function listBuddiesPage(filters: BuddyFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? BUDDY_PAGE_SIZE;
  const trimmedSearch = filters.search?.trim();

  const where: Prisma.BuddyWhereInput = {};
  if (filters.color) where.colorFamily = filters.color;

  // Same split as the skin gallery (see listSkins): fuzzy relevance can't be
  // ranked in SQL, so when there's search text we filter/sort/paginate in JS
  // over the color-filtered set, and otherwise let SQL do all three.
  if (trimmedSearch && trimmedSearch.length >= 2) {
    const candidates = await prisma.buddy.findMany({ where, orderBy: { displayName: "asc" } });
    const ranked = candidates
      .map((buddy) => ({ buddy, score: fuzzyScore(trimmedSearch, buddy.displayName) }))
      .filter((x): x is { buddy: (typeof candidates)[number]; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score || a.buddy.displayName.localeCompare(b.buddy.displayName));

    const total = ranked.length;
    const buddies = ranked.slice((page - 1) * pageSize, page * pageSize).map((r) => r.buddy);
    return { buddies, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
  }

  const [buddies, total] = await Promise.all([
    prisma.buddy.findMany({
      where,
      orderBy: { displayName: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.buddy.count({ where }),
  ]);

  return { buddies, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

// Only the color families that actually appear on at least one buddy - the
// full COLOR_FAMILIES list would offer filters that return nothing.
export async function getBuddyColorOptions(): Promise<string[]> {
  const rows = await prisma.buddy.findMany({
    where: { colorFamily: { not: null } },
    distinct: ["colorFamily"],
    select: { colorFamily: true },
    orderBy: { colorFamily: "asc" },
  });
  return rows.map((r) => r.colorFamily).filter((c): c is string => c !== null);
}
