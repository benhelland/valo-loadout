"use client";

import Link from "next/link";

export default function SkinDetailError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 text-center">
      <p className="text-muted">Something went wrong loading this skin.</p>
      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          onClick={reset}
          className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
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
