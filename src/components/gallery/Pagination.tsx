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
    <nav className="flex items-center justify-center gap-4 py-8 text-sm">
      {page > 1 ? (
        <a href={buildHref(searchParams, page - 1)} className="text-muted hover:text-foreground">
          ← Previous
        </a>
      ) : (
        <span className="text-muted/40">← Previous</span>
      )}
      <span className="text-muted">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <a href={buildHref(searchParams, page + 1)} className="text-muted hover:text-foreground">
          Next →
        </a>
      ) : (
        <span className="text-muted/40">Next →</span>
      )}
    </nav>
  );
}
