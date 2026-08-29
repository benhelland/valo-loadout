"use client";

import Image from "next/image";
import { getBuddyAnchor } from "@/lib/buddyAnchors";
import type { Buddy } from "@/generated/prisma/client";

interface BuddyPreviewProps {
  weaponDisplayName: string | null | undefined;
  stillImageUrl: string | null;
  skinDisplayName: string;
  buddies: Buddy[];
  // Controlled by the parent (SkinPreview) so the current buddy selection can
  // be read back out when building a /combo/:encoded share link.
  buddyId: string;
  onBuddyChange: (id: string) => void;
}

// Composites a buddy charm onto the skin's flat render - a 2D sticker-on-a-photo
// approximation, not a true render (no 3D model data exists - see docs/RISKS.md).
// Deliberately never runs against video: a fixed-percentage anchor point only
// makes sense against a static image, not a moving gameplay frame.
export function BuddyPreview({ weaponDisplayName, stillImageUrl, skinDisplayName, buddies, buddyId, onBuddyChange }: BuddyPreviewProps) {
  const buddy = buddies.find((b) => b.id === buddyId);
  const anchor = getBuddyAnchor(weaponDisplayName);

  return (
    <div className="mt-6 rounded-lg border border-border bg-surface p-4">
      <label className="flex flex-col gap-1 text-xs text-muted max-w-xs">
        Preview with buddy
        <select
          value={buddyId}
          onChange={(e) => onBuddyChange(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
        >
          <option value="">None</option>
          {buddies.map((b) => (
            <option key={b.id} value={b.id}>
              {b.displayName}
            </option>
          ))}
        </select>
      </label>

      {buddy ? (
        <div className="relative mt-3 aspect-[21/9] rounded border border-border bg-black/20 overflow-hidden">
          {stillImageUrl ? (
            <Image
              src={stillImageUrl}
              alt={skinDisplayName}
              fill
              sizes="(max-width: 1024px) 100vw, 60vw"
              className="object-contain p-6"
            />
          ) : null}
          {buddy.displayIconUrl ? (
            <div
              className="absolute"
              style={{
                left: `${anchor.xPct}%`,
                top: `${anchor.yPct}%`,
                width: `${anchor.scalePct}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <Image
                src={buddy.displayIconUrl}
                alt={buddy.displayName}
                width={100}
                height={100}
                className="w-full h-auto drop-shadow-lg"
              />
            </div>
          ) : null}
          <p className="absolute bottom-1.5 right-2 text-[10px] text-muted/70">Simulated placement, not an in-game render</p>
        </div>
      ) : null}
    </div>
  );
}
