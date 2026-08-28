"use client";

import { useState } from "react";
import Image from "next/image";
import { getBuddyAnchor } from "@/lib/buddyAnchors";
import type { Prisma, Buddy } from "@/generated/prisma/client";

type SkinDetail = Prisma.SkinGetPayload<{
  include: { weapon: true; contentTier: true; theme: true; levels: true; chromas: true; vibeTags: true };
}>;

interface SkinPreviewProps {
  skin: SkinDetail;
  buddies: Buddy[];
}

interface Media {
  imageUrl: string | null;
  videoUrl: string | null;
  label: string;
}

export function SkinPreview({ skin, buddies }: SkinPreviewProps) {
  const defaultLevel = skin.levels[0];
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(defaultLevel?.id ?? null);
  const [selectedChromaId, setSelectedChromaId] = useState<string | null>(null);
  const [buddyId, setBuddyId] = useState<string>("");

  const activeChroma = skin.chromas.find((c) => c.id === selectedChromaId);
  const activeLevel = skin.levels.find((l) => l.id === selectedLevelId);

  const media: Media = activeChroma
    ? {
        imageUrl: activeChroma.fullRenderUrl ?? activeChroma.displayIconUrl ?? skin.displayIconUrl,
        videoUrl: activeChroma.videoUrl,
        label: activeChroma.displayName ?? skin.displayName,
      }
    : {
        imageUrl: activeLevel?.displayIconUrl ?? skin.displayIconUrl,
        videoUrl: activeLevel?.videoUrl ?? null,
        label: activeLevel ? `Level ${activeLevel.levelIndex}` : skin.displayName,
      };

  const buddy = buddies.find((b) => b.id === buddyId);
  const anchor = getBuddyAnchor(skin.weapon?.displayName);

  function selectLevel(id: string) {
    setSelectedLevelId(id);
    setSelectedChromaId(null);
  }

  function selectChroma(id: string) {
    setSelectedChromaId(id);
  }

  return (
    <div>
      <div className="relative aspect-video rounded-lg border border-border bg-surface overflow-hidden">
        {media.videoUrl ? (
          <video
            key={media.videoUrl}
            src={media.videoUrl}
            autoPlay
            muted
            loop
            playsInline
            controls
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : media.imageUrl ? (
          <Image
            key={media.imageUrl}
            src={media.imageUrl}
            alt={media.label}
            fill
            sizes="(max-width: 1024px) 100vw, 60vw"
            className="object-contain p-8"
            priority
          />
        ) : null}

        {buddy?.displayIconUrl ? (
          <div
            className="absolute pointer-events-none"
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
      </div>

      {skin.levels.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs text-muted mb-2">Level</p>
          <div className="flex flex-wrap gap-2">
            {skin.levels.map((level) => (
              <button
                key={level.id}
                onClick={() => selectLevel(level.id)}
                className={`rounded border px-3 py-1.5 text-sm transition-colors ${
                  selectedLevelId === level.id && !selectedChromaId
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border text-muted hover:text-foreground hover:border-foreground/30"
                }`}
              >
                {level.levelIndex}
                {level.levelItem ? ` — ${level.levelItem}` : ""}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {skin.chromas.length > 1 ? (
        <div className="mt-4">
          <p className="text-xs text-muted mb-2">Color</p>
          <div className="flex flex-wrap gap-2">
            {skin.chromas.map((chroma) => (
              <button
                key={chroma.id}
                onClick={() => selectChroma(chroma.id)}
                title={chroma.displayName ?? undefined}
                className={`relative h-9 w-9 rounded-full border-2 overflow-hidden transition-colors ${
                  selectedChromaId === chroma.id ? "border-accent" : "border-border hover:border-foreground/40"
                }`}
              >
                {chroma.swatchUrl ?? chroma.displayIconUrl ? (
                  <Image
                    src={chroma.swatchUrl ?? chroma.displayIconUrl!}
                    alt={chroma.displayName ?? "Chroma"}
                    fill
                    sizes="36px"
                    className="object-cover"
                  />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <label className="flex flex-col gap-1 text-xs text-muted max-w-xs">
          Preview with buddy
          <select
            value={buddyId}
            onChange={(e) => setBuddyId(e.target.value)}
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
      </div>
    </div>
  );
}
