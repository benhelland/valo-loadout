import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { fuzzyScore } from "@/lib/fuzzyMatch";
import { DEFAULT_BUDDY_PAGE_SIZE, resolvePage } from "@/lib/pageSize";

export const BUDDY_PAGE_SIZE = DEFAULT_BUDDY_PAGE_SIZE;

export interface BuddyFilters {
  search?: string;
  color?: string;
  page?: number;
  // Must already be validated - see resolvePageSize in src/lib/pageSize.ts.
  pageSize?: number;
}

export async function listBuddiesPage(filters: BuddyFilters) {
  // Resolved rather than trusted, for the same reasons as the skin gallery:
  // a non-numeric `?page=` would otherwise reach Prisma as `skip: NaN`.
  const page = resolvePage(filters.page);
  const pageSize = filters.pageSize ?? BUDDY_PAGE_SIZE;
  const trimmedSearch = filters.search?.trim();

  const where: Prisma.BuddyWhereInput = {};
  if (filters.color) where.colorFamily = filters.color;

  // Same split as the skin gallery (see listSkins): fuzzy relevance can't be
  // ranked in SQL, so when there's search text we filter/sort/paginate in JS
  // over the color-filtered set, and otherwise let SQL do all three.
  if (trimmedSearch && trimmedSearch.length >= 2) {
    // Two phases, as in listSkins. Ranking needs every candidate but
    // rendering needs one page, so phase one selects only the two columns
    // scoring and tie-breaking read.
    const candidates = await prisma.buddy.findMany({
      where,
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    });
    const ranked = candidates
      .map((buddy) => ({ buddy, score: fuzzyScore(trimmedSearch, buddy.displayName) }))
      .filter((x): x is { buddy: (typeof candidates)[number]; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score || a.buddy.displayName.localeCompare(b.buddy.displayName));

    const total = ranked.length;
    const pageIds = ranked.slice((page - 1) * pageSize, page * pageSize).map((r) => r.buddy.id);

    // payload-ok: bounded by pageIds, which is one page window at most.
    const hydrated = await prisma.buddy.findMany({ where: { id: { in: pageIds } } });
    const byId = new Map(hydrated.map((b) => [b.id, b]));
    const buddies = pageIds.map((id) => byId.get(id)).filter((b): b is (typeof hydrated)[number] => b !== undefined);

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
