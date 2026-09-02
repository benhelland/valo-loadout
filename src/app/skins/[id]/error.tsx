"use client";

import Link from "next/link";

export default function SkinDetailError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 text-center">
      <p className="text-muted">Something went wrong loading this skin.</p>
      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          onClick={reset}
          className="clip-notch-sm bg-accent px-5 py-2 text-xs font-bold uppercase tracking-widest text-accent-contrast transition-colors hover:bg-accent-dark"
        >
          Try again
        </button>
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          Back to gallery
        </Link>
      </div>
    </div>
  );
}
