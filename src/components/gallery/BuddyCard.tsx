import Image from "next/image";
import Link from "next/link";
import type { Buddy } from "@/generated/prisma/client";

interface BuddyCardProps {
  buddy: Buddy;
  // Set only in the gallery's "pick a buddy for a skin" mode - makes the
  // card a real link back to wherever the user came from, with this buddy
  // applied. Absent in plain browse mode, where cards are deliberately
  // inert: buddies have no detail page, so a hover state or cursor change
  // would imply an interaction that doesn't exist.
  selectHref?: string;
  isSelected?: boolean;
}

export function BuddyCard({ buddy, selectHref, isSelected }: BuddyCardProps) {
  const inner = (
    <>
      <div className="relative aspect-square bg-black/20">
        {buddy.displayIconUrl ? (
          <Image src={buddy.displayIconUrl} alt={buddy.displayName} fill sizes="140px" quality={60}
          className="object-contain p-2" />
        ) : null}
      </div>
      <p className="mt-1.5 truncate text-center text-[11px] font-medium text-foreground">{buddy.displayName}</p>
    </>
  );

  if (!selectHref) {
    return <div className="clip-notch-sm border border-border bg-surface p-2">{inner}</div>;
  }

  return (
    <Link
      href={selectHref}
      title={`Equip ${buddy.displayName}`}
      className={`clip-notch-sm block border bg-surface p-2 transition-colors ${
        isSelected ? "border-accent bg-accent/10" : "border-border hover:border-accent/60 hover:bg-surface-hover"
      }`}
    >
      {inner}
    </Link>
  );
}
