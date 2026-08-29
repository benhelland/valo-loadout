import Image from "next/image";
import type { Buddy } from "@/generated/prisma/client";

// No link target - buddies don't have a detail page (there's not much more
// to show than the name/icon already here), this is a browse/reference
// grid, not a picker. Picking one for a skin still happens on the skin
// detail page itself.
export function BuddyCard({ buddy }: { buddy: Buddy }) {
  return (
    <div className="clip-notch-sm border border-border bg-surface p-2 hover:border-accent/40 transition-colors">
      <div className="relative aspect-square bg-black/20">
        {buddy.displayIconUrl ? (
          <Image src={buddy.displayIconUrl} alt={buddy.displayName} fill sizes="140px" className="object-contain p-2" />
        ) : null}
      </div>
      <p className="mt-1.5 truncate text-center text-[11px] font-medium text-foreground">{buddy.displayName}</p>
    </div>
  );
}
