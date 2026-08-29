import { PageSizeSelect } from "@/components/gallery/PageSizeSelect";

interface PaginationProps {
  page: number;
  pageCount: number;
  searchParams: Record<string, string | undefined>;
  // Where page links point - defaults to the main gallery. The loadout
  // picker overrides this to stay within its own scoped weapon URL.
  basePath?: string;
  // Omit to hide the per-page dropdown entirely (the loadout picker keeps
  // its own pagination simple).
  pageSizeOptions?: readonly number[];
  pageSize?: number;
}

function buildHref(basePath: string, searchParams: Record<string, string | undefined>, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value && key !== "page") params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({
  page,
  pageCount,
  searchParams,
  basePath = "/",
  pageSizeOptions,
  pageSize,
}: PaginationProps) {
  const showPageSize = pageSizeOptions !== undefined && pageSize !== undefined;
  // Still render when there's only one page, as long as there's a per-page
  // dropdown to show: bumping the size up to where everything fits on one
  // page would otherwise hide the only control that can change it back.
  if (pageCount <= 1 && !showPageSize) return null;

  return (
    <nav className="flex flex-wrap items-center justify-center gap-6 py-8 text-sm font-semibold uppercase tracking-widest">
      {pageCount > 1 ? (
        <>
          {page > 1 ? (
            <a href={buildHref(basePath, searchParams, page - 1)} className="text-muted hover:text-accent transition-colors">
              ← Previous
            </a>
          ) : (
            <span className="text-muted/30">← Previous</span>
          )}
          <span className="text-foreground">
            Page {page} <span className="text-muted">of {pageCount}</span>
          </span>
          {page < pageCount ? (
            <a href={buildHref(basePath, searchParams, page + 1)} className="text-muted hover:text-accent transition-colors">
              Next →
            </a>
          ) : (
            <span className="text-muted/30">Next →</span>
          )}
        </>
      ) : null}

      {showPageSize ? <PageSizeSelect options={pageSizeOptions} current={pageSize} /> : null}
    </nav>
  );
}
