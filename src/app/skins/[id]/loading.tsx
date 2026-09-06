// A skeleton in the shape of the real skin page, so the layout does not jump
// when content arrives. Overrides the generic app/loading.tsx for this route.
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8" role="status" aria-live="polite">
      <span className="sr-only">Loading skin</span>
      <div className="h-4 w-32 animate-pulse bg-surface" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_420px]">
        <div>
          <div className="h-9 w-48 animate-pulse bg-surface" />
          <div className="clip-notch mt-3 aspect-video animate-pulse border border-border bg-surface lg:aspect-auto lg:h-[640px]" />
        </div>
        <div className="space-y-3">
          <div className="h-6 w-40 animate-pulse bg-surface" />
          <div className="h-12 w-full animate-pulse bg-surface" />
          <div className="h-9 w-44 animate-pulse bg-surface" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 w-full animate-pulse bg-surface" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
