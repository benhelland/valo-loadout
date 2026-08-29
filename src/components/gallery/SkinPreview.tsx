"use client";

import { useState } from "react";
import Image from "next/image";
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
  // The static info panel (tier/name/stats/vibe tags), server-rendered by
  // SkinDetailView and dropped into the top of the sidebar here - see that
  // component for why it's structured this way.
  children: React.ReactNode;
}

interface Media {
  imageUrl: string | null;
  videoUrl: string | null;
  label: string;
}

export function SkinPreview({ skin, buddies, initialLevelId, initialChromaId, initialBuddyId, children }: SkinPreviewProps) {
  const defaultLevel = skin.levels[0];
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(initialLevelId ?? defaultLevel?.id ?? null);
  const [selectedChromaId, setSelectedChromaId] = useState<string | null>(initialChromaId ?? null);
  const [selectedBuddyId, setSelectedBuddyId] = useState<string>(initialBuddyId ?? "");
  const [linkCopied, setLinkCopied] = useState(false);

  const activeChroma = skin.chromas.find((c) => c.id === selectedChromaId);
  const activeLevel = skin.levels.find((l) => l.id === selectedLevelId);
  const buddy = buddies.find((b) => b.id === selectedBuddyId);

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
    <div className="grid lg:grid-cols-[1fr_420px] gap-8 items-start">
      {/* Media - the hero. Fixed tall height on large screens instead of a
          16:9 crop, so it reads as the star of the page rather than sharing
          the spotlight evenly with the sidebar. */}
      <div className="relative border border-border bg-surface overflow-hidden aspect-video lg:aspect-auto lg:h-[640px]">
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
            sizes="(max-width: 1024px) 100vw, 65vw"
            className="object-contain p-10"
            priority
          />
        ) : null}

        {/* Targeting-bracket corner accents - purely decorative, echoes the
            client's inspect-view framing. */}
        <span className="pointer-events-none absolute left-3 top-3 h-6 w-6 border-l-2 border-t-2 border-accent/70" />
        <span className="pointer-events-none absolute right-3 top-3 h-6 w-6 border-r-2 border-t-2 border-accent/70" />
        <span className="pointer-events-none absolute left-3 bottom-3 h-6 w-6 border-l-2 border-b-2 border-accent/70" />
        <span className="pointer-events-none absolute right-3 bottom-3 h-6 w-6 border-r-2 border-b-2 border-accent/70" />

        {/* Buddy badge - a corner icon, not a composite onto the weapon
            itself. Mirrors how Riot's own store/inventory UI pairs a buddy
            with a skin (a badge, never glued onto the gun render). Anchored
            to the frame corner rather than any point on the weapon, so it
            works identically over video or a still image, with no
            per-weapon tuning - see docs/ARCHITECTURE.md "Buddy pairing".
            Top-right, not bottom - at this size a bottom placement would
            sit on top of the video's native control bar on hover. */}
        {buddy?.displayIconUrl ? (
          <div
            title={buddy.displayName}
            className="absolute top-4 right-4 h-24 w-24 rounded-full border-2 border-accent/60 bg-black/60 p-2.5 shadow-lg backdrop-blur-sm"
          >
            <div className="relative h-full w-full">
              <Image src={buddy.displayIconUrl} alt={buddy.displayName} fill sizes="96px" className="object-contain" />
            </div>
          </div>
        ) : null}
      </div>

      {/* Sidebar - skin info up top, then the interactive controls, all in
          one panel so it fills out next to the (much taller) media area
          instead of trailing off short. */}
      <aside className="border border-border border-t-2 border-t-accent bg-surface p-6">
        {children}

        {skin.levels.length > 0 ? (
          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Level</p>
            <div className="flex flex-col gap-1.5">
              {skin.levels.map((level) => (
                <button
                  key={level.id}
                  onClick={() => selectLevel(level.id)}
                  className={`flex items-center justify-between border px-3 py-2 text-sm transition-colors ${
                    selectedLevelId === level.id && !selectedChromaId
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border text-muted hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  <span className="font-semibold uppercase tracking-wide">Level {level.levelIndex}</span>
                  {level.levelItem ? <span className="text-xs text-muted">{level.levelItem}</span> : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {skin.chromas.length > 1 ? (
          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Color</p>
            <div className="flex flex-wrap gap-2.5">
              {skin.chromas.map((chroma) => (
                <button
                  key={chroma.id}
                  onClick={() => selectChroma(chroma.id)}
                  title={chroma.displayName ?? undefined}
                  className={`relative h-10 w-10 rounded-full border-2 overflow-hidden transition-colors ${
                    selectedChromaId === chroma.id ? "border-accent" : "border-border hover:border-foreground/40"
                  }`}
                >
                  {chroma.swatchUrl ?? chroma.displayIconUrl ? (
                    <Image
                      src={chroma.swatchUrl ?? chroma.displayIconUrl!}
                      alt={chroma.displayName ?? "Chroma"}
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {isMelee ? null : (
          <div className="mt-6">
            <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Buddy
              <select
                value={selectedBuddyId}
                onChange={(e) => setSelectedBuddyId(e.target.value)}
                className="rounded-none border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none transition-colors"
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
        )}

        <button
          onClick={copyShareLink}
          className="clip-notch-sm mt-6 w-full border border-border py-2.5 text-xs font-semibold uppercase tracking-widest text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          {linkCopied ? "Copied!" : "Copy share link"}
        </button>
      </aside>
    </div>
  );
}
