"use client";

import { useState } from "react";
import Image from "next/image";
import { BuddyPreview } from "@/components/gallery/BuddyPreview";
import { encodeCombo } from "@/lib/comboLink";
import type { Prisma, Buddy } from "@/generated/prisma/client";

type SkinDetail = Prisma.SkinGetPayload<{
  include: { weapon: true; contentTier: true; theme: true; levels: true; chromas: true; vibeTags: true };
}>;

interface SkinPreviewProps {
  skin: SkinDetail;
  buddies: Buddy[];
  // Pre-selects this exact level/chroma/buddy combo - set when arriving via a
  // /combo/:encoded share link. Absent on the normal gallery detail page.
  initialLevelId?: string | null;
  initialChromaId?: string | null;
  initialBuddyId?: string | null;
}

interface Media {
  imageUrl: string | null;
  videoUrl: string | null;
  label: string;
}

export function SkinPreview({ skin, buddies, initialLevelId, initialChromaId, initialBuddyId }: SkinPreviewProps) {
  const defaultLevel = skin.levels[0];
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(initialLevelId ?? defaultLevel?.id ?? null);
  const [selectedChromaId, setSelectedChromaId] = useState<string | null>(initialChromaId ?? null);
  const [selectedBuddyId, setSelectedBuddyId] = useState<string>(initialBuddyId ?? "");
  const [linkCopied, setLinkCopied] = useState(false);

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

  const isMelee = skin.weapon?.category === "Melee";
  // Always a flat render, never the video - a buddy overlay only makes sense
  // against a static image. See src/components/gallery/BuddyPreview.tsx.
  const stillImageUrl = activeChroma
    ? (activeChroma.fullRenderUrl ?? activeChroma.displayIconUrl ?? skin.displayIconUrl)
    : skin.displayIconUrl;

  function selectLevel(id: string) {
    setSelectedLevelId(id);
    setSelectedChromaId(null);
  }

  function selectChroma(id: string) {
    setSelectedChromaId(id);
  }

  async function copyShareLink() {
    const encoded = encodeCombo({
      skinId: skin.id,
      levelId: selectedLevelId,
      chromaId: selectedChromaId,
      buddyId: selectedBuddyId || null,
    });
    const url = `${window.location.origin}/combo/${encoded}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <div>
      <div className="relative aspect-video rounded-lg border border-border bg-surface overflow-hidden">
        {media.videoUrl ? (
          <video
            key={media.videoUrl}
            src={media.videoUrl}
            poster={media.imageUrl ?? undefined}
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
      </div>

      <div className="mt-3 flex justify-end">
        <button
          onClick={copyShareLink}
          className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          {linkCopied ? "Copied!" : "Copy share link"}
        </button>
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

      {isMelee ? null : (
        <BuddyPreview
          weaponDisplayName={skin.weapon?.displayName}
          stillImageUrl={stillImageUrl}
          skinDisplayName={skin.displayName}
          buddies={buddies}
          buddyId={selectedBuddyId}
          onBuddyChange={setSelectedBuddyId}
        />
      )}
    </div>
  );
}
