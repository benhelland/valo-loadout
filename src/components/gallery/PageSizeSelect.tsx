"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface PageSizeSelectProps {
  options: readonly number[];
  current: number;
}

// Changing page size always jumps back to page 1 - staying on, say, page 7
// while shrinking the page size can land you past the end of the results.
export function PageSizeSelect({ options, current }: PageSizeSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("pageSize", value);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
      Per page
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-none border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-accent focus:outline-none transition-colors"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
