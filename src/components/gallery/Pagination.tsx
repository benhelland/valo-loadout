interface PaginationProps {
  page: number;
  pageCount: number;
  searchParams: Record<string, string | undefined>;
  // Where page links point - defaults to the main gallery. The loadout
  // picker overrides this to stay within its own scoped weapon URL.
  basePath?: string;
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

export function Pagination({ page, pageCount, searchParams, basePath = "/" }: PaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <nav className="flex items-center justify-center gap-6 py-8 text-sm font-semibold uppercase tracking-widest">
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
    </nav>
  );
}
