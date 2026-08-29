interface PaginationProps {
  page: number;
  pageCount: number;
  searchParams: Record<string, string | undefined>;
}

function buildHref(searchParams: Record<string, string | undefined>, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value && key !== "page") params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export function Pagination({ page, pageCount, searchParams }: PaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <nav className="flex items-center justify-center gap-6 py-8 text-sm font-semibold uppercase tracking-widest">
      {page > 1 ? (
        <a href={buildHref(searchParams, page - 1)} className="text-muted hover:text-accent transition-colors">
          ← Previous
        </a>
      ) : (
        <span className="text-muted/30">← Previous</span>
      )}
      <span className="text-foreground">
        Page {page} <span className="text-muted">of {pageCount}</span>
      </span>
      {page < pageCount ? (
        <a href={buildHref(searchParams, page + 1)} className="text-muted hover:text-accent transition-colors">
          Next →
        </a>
      ) : (
        <span className="text-muted/30">Next →</span>
      )}
    </nav>
  );
}
