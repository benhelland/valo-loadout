"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { encodeCombo } from "@/lib/comboLink";
import { setLoadoutItem } from "@/actions/loadouts";
import { DraggableBuddyBadge } from "@/components/gallery/DraggableBuddyBadge";
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
  // Present only when reached via the loadout builder's picker
  // (/loadouts/[id]/weapon/[weaponId]/skins/[skinId]) - adds an "Add to
  // Loadout" action that saves the current level/chroma/buddy selection
  // into that weapon slot and returns to the board.
  loadoutContext?: { loadoutId: string; weaponId: string; loadoutName: string };
  // The signed-in user's loadouts, for the *gallery-side* "add to loadout"
  // control. Distinct from loadoutContext above: that one is set when the
  // user came from a specific slot in a specific loadout, this one is for
  // someone browsing normally who wants to drop the skin they're looking at
  // into a loadout without going back to the board and starting over. Null
  // when signed out; an empty array means signed in with no loadouts yet.
  loadouts?: { id: string; name: string }[] | null;
  // The static info panel (tier/name/stats/vibe tags), server-rendered by
  // SkinDetailView and dropped into the top of the sidebar here - see that
  // component for why it's structured this way.
  children: React.ReactNode;
}

export function SkinPreview({
  skin,
  buddies,
  initialLevelId,
  initialChromaId,
  initialBuddyId,
  loadoutContext,
  loadouts,
  children,
}: SkinPreviewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isSaving, startSaving] = useTransition();
  const [targetLoadoutId, setTargetLoadoutId] = useState(loadouts?.[0]?.id ?? "");
  const [addedTo, setAddedTo] = useState<string | null>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const defaultLevel = skin.levels[0];
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(initialLevelId ?? defaultLevel?.id ?? null);
  const [selectedChromaId, setSelectedChromaId] = useState<string | null>(initialChromaId ?? null);
  const [selectedBuddyId, setSelectedBuddyId] = useState<string>(initialBuddyId ?? "");
  // Defaults to the still image - never auto-plays video. Switching levels/
  // chromas while browsing shouldn't cause a video-loading flash, and there
  // needs to be an explicit way to just look at the flat render. Video is
  // opt-in via the Animation tab below.
  const [showVideo, setShowVideo] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const activeChroma = skin.chromas.find((c) => c.id === selectedChromaId);
  const activeLevel = skin.levels.find((l) => l.id === selectedLevelId);
  const buddy = buddies.find((b) => b.id === selectedBuddyId);

  // The base/default chroma always carries the API's only reliably high-res
  // flat asset (fullRenderUrl); a level only ever has a smaller displayIcon,
  // and that icon is chroma-agnostic (one set of level icons per skin,
  // regardless of which color chroma is picked).
  //
  // Priority: an explicitly-selected chroma always wins (it's the only way
  // to see that color). Otherwise, for skins with real level-to-level
  // progression (verified: ~half of multi-level skins have genuinely
  // different art per level - upgrade glow-ups etc.), prefer that level's
  // own icon so the progression is visible, falling back to the high-res
  // render only where a given level lacks its own. For skins with just a
  // single level (no progression to show), always prefer the high-res
  // render - that's what was previously falling back to a small icon and
  // looking low-res by default.
  const defaultChroma = skin.chromas[0];
  const hasMultipleLevels = skin.levels.length > 1;
  const stillImageUrl = activeChroma
    ? (activeChroma.fullRenderUrl ?? activeChroma.displayIconUrl ?? skin.displayIconUrl)
    : hasMultipleLevels
      ? (activeLevel?.displayIconUrl ?? defaultChroma?.fullRenderUrl ?? defaultChroma?.displayIconUrl ?? skin.displayIconUrl)
      : (defaultChroma?.fullRenderUrl ?? activeLevel?.displayIconUrl ?? defaultChroma?.displayIconUrl ?? skin.displayIconUrl);
  // A selected chroma without its own video (confirmed real: some skins'
  // base/default chroma has no dedicated clip - the per-level videos
  // already cover that color, so a chroma-specific one is never provided
  // upstream) still falls through to the active level's video rather than
  // showing no animation at all.
  const videoUrl = activeChroma
    ? (activeChroma.videoUrl ?? activeLevel?.videoUrl ?? defaultChroma?.videoUrl ?? null)
    : (activeLevel?.videoUrl ?? defaultChroma?.videoUrl ?? null);
  // Shown visibly under the media, not just as alt text - the chroma's own
  // name (e.g. "Byteshift Outlaw (Variant 2 Red)") is the only way to tell
  // which color variant you're actually looking at.
  const label = activeChroma?.displayName ?? (activeLevel ? `Level ${activeLevel.levelIndex}` : skin.displayName);
  const hasVideo = Boolean(videoUrl);

  const isMelee = skin.weapon?.category === "Melee";

  function selectLevel(id: string) {
    setSelectedLevelId(id);
    setSelectedChromaId(null);
  }

  function selectChroma(id: string) {
    setSelectedChromaId(id);
  }

  function addToLoadout() {
    if (!loadoutContext) return;
    startSaving(async () => {
      await setLoadoutItem({
        loadoutId: loadoutContext.loadoutId,
        weaponId: loadoutContext.weaponId,
        skinId: skin.id,
        levelId: selectedLevelId,
        chromaId: selectedChromaId,
        buddyId: selectedBuddyId || null,
      });
      router.push(`/loadouts/${loadoutContext.loadoutId}`);
    });
  }

  // The gallery-side equivalent of addToLoadout: same mutation, but the
  // weapon slot is inferred from the skin itself (a Vandal skin can only go
  // in the Vandal slot) rather than being chosen up front by clicking into
  // that slot. Stays on the page and confirms inline instead of navigating
  // to the board - the user was browsing, and shouldn't be yanked out of it.
  function addToChosenLoadout() {
    if (!skin.weaponId || !targetLoadoutId) return;
    const weaponId = skin.weaponId;
    startSaving(async () => {
      await setLoadoutItem({
        loadoutId: targetLoadoutId,
        weaponId,
        skinId: skin.id,
        levelId: selectedLevelId,
        chromaId: selectedChromaId,
        buddyId: selectedBuddyId || null,
      });
      setAddedTo(loadouts?.find((l) => l.id === targetLoadoutId)?.name ?? "loadout");
    });
  }

  // Sends the user to the buddy gallery in "pick" mode, carrying the
  // current level/chroma selection so returning with a chosen buddy doesn't
  // silently reset them (that state is client-only otherwise). Works from
  // both the plain skin page and the loadout assign page, since the return
  // path is just wherever we currently are.
  function buildBuddyPickerHref(): string {
    const returnParams = new URLSearchParams();
    if (selectedLevelId) returnParams.set("levelId", selectedLevelId);
    if (selectedChromaId) returnParams.set("chromaId", selectedChromaId);
    const returnTo = returnParams.toString() ? `${pathname}?${returnParams.toString()}` : pathname;

    const pickerParams = new URLSearchParams({ returnTo });
    if (selectedBuddyId) pickerParams.set("currentBuddyId", selectedBuddyId);
    return `/buddies?${pickerParams.toString()}`;
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
      <div>
        {hasVideo ? (
          <div className="mb-3 flex gap-5 text-xs font-semibold uppercase tracking-widest">
            <button
              onClick={() => setShowVideo(false)}
              className={`border-b-2 pb-1 transition-colors ${
                !showVideo ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              Image
            </button>
            <button
              onClick={() => setShowVideo(true)}
              className={`border-b-2 pb-1 transition-colors ${
                showVideo ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              Animation
            </button>
          </div>
        ) : null}

        <div ref={mediaRef} className="relative border border-border bg-surface overflow-hidden aspect-video lg:aspect-auto lg:h-[640px]">
          {showVideo && videoUrl ? (
            <video
              key={videoUrl}
              src={videoUrl}
              poster={stillImageUrl ?? undefined}
              autoPlay
              muted
              loop
              playsInline
              controls
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : stillImageUrl ? (
            <Image
              key={stillImageUrl}
              src={stillImageUrl}
              alt={label}
              fill
              sizes="(max-width: 1024px) 100vw, 65vw"
              className="object-contain p-10"
              priority
            />
          ) : null}

          {/* Targeting-bracket corner accents - purely decorative, echoes the
              client's inspect-view framing. Deliberately neutral rather than
              accent-red: this frames the skin art, and four saturated red
              brackets around a colourful render fight the thing they're
              meant to be presenting. */}
          <span className="pointer-events-none absolute left-3 top-3 h-6 w-6 border-l-2 border-t-2 border-foreground/25" />
          <span className="pointer-events-none absolute right-3 top-3 h-6 w-6 border-r-2 border-t-2 border-foreground/25" />
          <span className="pointer-events-none absolute left-3 bottom-3 h-6 w-6 border-l-2 border-b-2 border-foreground/25" />
          <span className="pointer-events-none absolute right-3 bottom-3 h-6 w-6 border-r-2 border-b-2 border-foreground/25" />

          {/* Buddy badge - a corner icon, not a composite onto the weapon
              itself. Mirrors how Riot's own store/inventory UI pairs a buddy
              with a skin (a badge, never glued onto the gun render) - see
              docs/ARCHITECTURE.md "Buddy pairing". Moveable/resizable within
              this frame while on the Image tab; snaps to the default
              top-right position/size and stops being interactive on the
              Animation tab, both because dragging over playing video is a
              distraction and because a bottom placement at a user-picked
              size could end up sitting on the video's native control bar. */}
          {buddy?.displayIconUrl ? (
            <DraggableBuddyBadge
              containerRef={mediaRef}
              displayIconUrl={buddy.displayIconUrl}
              displayName={buddy.displayName}
              locked={showVideo}
            />
          ) : null}
        </div>

        <p className="mt-2 text-xs uppercase tracking-wide text-muted">Now showing: {label}</p>
      </div>

      {/* Sidebar - skin info up top, then the interactive controls, all in
          one panel so it fills out next to the (much taller) media area
          instead of trailing off short. */}
      <aside className="border border-border bg-surface p-6">
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
            {/* The dropdown is fine when you know the buddy's name; this is
                the path for "show me what's available" - the full buddy
                gallery with search and color filtering, which comes back
                here with the pick applied and the rest of the selection
                intact (see buildBuddyPickerHref). */}
            <Link
              href={buildBuddyPickerHref()}
              className="mt-2 inline-block text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-accent transition-colors"
            >
              Browse all buddies →
            </Link>
          </div>
        )}

        {loadoutContext ? (
          <button
            onClick={addToLoadout}
            disabled={isSaving}
            className="clip-notch-sm mt-6 w-full bg-accent py-2.5 text-xs font-bold uppercase tracking-widest text-accent-contrast hover:bg-accent-dark transition-colors disabled:opacity-50"
          >
            {isSaving ? "Saving..." : `Add to ${loadoutContext.loadoutName}`}
          </button>
        ) : null}

        {/* The gallery previously had no route into the loadout builder at
            all: "Add to Loadout" only existed when you'd arrived from a
            specific weapon slot, so anyone who found a skin while browsing
            had to abandon the page, go to /loadouts, pick a loadout, pick
            the slot, and find the skin again. Melee skins are excluded from
            neither - skin.weaponId covers knives too. */}
        {!loadoutContext && loadouts && skin.weaponId ? (
          <div className="mt-6 border-t border-border pt-6">
            {loadouts.length === 0 ? (
              <Link
                href="/loadouts"
                className="clip-notch-sm block w-full border border-border py-2.5 text-center text-xs font-semibold uppercase tracking-widest text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                Create a loadout to add this
              </Link>
            ) : (
              <>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Add to loadout</p>
                <div className="flex gap-2">
                  <select
                    value={targetLoadoutId}
                    onChange={(e) => {
                      setTargetLoadoutId(e.target.value);
                      setAddedTo(null);
                    }}
                    aria-label="Loadout to add this skin to"
                    className="min-w-0 flex-1 rounded-none border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors focus:border-accent focus:outline-none"
                  >
                    {loadouts.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={addToChosenLoadout}
                    disabled={isSaving}
                    className="clip-notch-sm shrink-0 bg-accent px-4 text-xs font-bold uppercase tracking-widest text-accent-contrast transition-colors hover:bg-accent-dark disabled:opacity-50"
                  >
                    {isSaving ? "…" : "Add"}
                  </button>
                </div>
                {addedTo ? (
                  <p className="mt-2 text-[11px] text-muted">
                    Added to {addedTo}.{" "}
                    <Link href={`/loadouts/${targetLoadoutId}`} className="text-accent hover:underline">
                      View loadout →
                    </Link>
                  </p>
                ) : (
                  <p className="mt-2 text-[11px] text-muted">
                    Fills the {skin.weapon?.displayName ?? "weapon"} slot with the level, color and buddy
                    selected above.
                  </p>
                )}
              </>
            )}
          </div>
        ) : null}

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
