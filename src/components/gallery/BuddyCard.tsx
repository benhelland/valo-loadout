"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { Buddy } from "@/generated/prisma/client";

interface BuddyCardProps {
  buddy: Buddy;
  // Set only in the gallery's "pick a buddy for a skin" mode - makes the
  // card a button back to wherever the user came from, with this buddy
  // applied. Absent in plain browse mode, where cards are deliberately
  // inert: buddies have no detail page, so a hover state or cursor change
  // would imply an interaction that doesn't exist.
  //
  // A button rather than a link on purpose. Every card is a distinct
  // server-rendered skin-page URL, and a page of anchors to them is a set a
  // crawler will walk - one that ignores robots.txt included. Nothing here
  // needs to be a navigable address.
  selectHref?: string;
  isSelected?: boolean;
}

export function BuddyCard({ buddy, selectHref, isSelected }: BuddyCardProps) {
  const router = useRouter();
  const inner = (
    <>
      <div className="relative aspect-square bg-black/20">
        {buddy.displayIconUrl ? (
          <Image src={buddy.displayIconUrl} alt={buddy.displayName} fill sizes="140px"
          className="fade-in-image object-contain p-2" />
        ) : null}
      </div>
      <p className="mt-1.5 truncate text-center text-[11px] font-medium text-foreground">{buddy.displayName}</p>
    </>
  );

  if (!selectHref) {
    return <div className="clip-notch-sm border border-border bg-surface p-2">{inner}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => router.push(selectHref)}
      title={`Equip ${buddy.displayName}`}
      className={`clip-notch-sm block w-full border bg-surface p-2 text-left transition-colors ${
        isSelected ? "border-accent bg-accent/10" : "border-border hover:border-accent/60 hover:bg-surface-hover"
      }`}
    >
      {inner}
    </button>
  );
}
