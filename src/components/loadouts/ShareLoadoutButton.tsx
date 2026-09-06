"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { toPng } from "html-to-image";
import { enableLoadoutSharing, disableLoadoutSharing } from "@/actions/loadouts";
import { LoadoutShareImage } from "@/components/loadouts/LoadoutShareImage";
import type { getLoadout, listAllWeapons } from "@/queries/loadouts";

// Fixed rather than measured: the panel's height varies with its contents, and
// the position has to be decided before it renders. These bound the clamp.
const PANEL_WIDTH = 320;
const PANEL_MAX_HEIGHT = 420;

type Loadout = NonNullable<Awaited<ReturnType<typeof getLoadout>>>;
type Weapon = Awaited<ReturnType<typeof listAllWeapons>>[number];

interface ShareLoadoutButtonProps {
  loadout: Loadout;
  weapons: Weapon[];
  initialShareSlug: string | null;
  // Compact styling for the loadout list's cards, where this sits inline
  // with the other per-card text actions rather than as a bordered button.
  variant?: "button" | "inline";
}

export function ShareLoadoutButton({ loadout, weapons, initialShareSlug, variant = "button" }: ShareLoadoutButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const [shareSlug, setShareSlug] = useState(initialShareSlug);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  // Holds the generated PNG so "Download" doesn't have to re-render and
  // re-capture the whole board a second time.
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  const shareUrl = shareSlug && typeof window !== "undefined" ? `${window.location.origin}/l/${shareSlug}` : null;

  function handleCreateLink() {
    startTransition(async () => {
      const slug = await enableLoadoutSharing(loadout.id);
      setShareSlug(slug);
      const url = `${window.location.origin}/l/${slug}`;
      try {
        await navigator.clipboard.writeText(url);
        setStatus("Share link copied to clipboard.");
      } catch {
        setStatus("Share link created (copy it below).");
      }
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      await disableLoadoutSharing(loadout.id);
      setShareSlug(null);
      setStatus("Sharing turned off - the old link no longer works.");
    });
  }

  async function handleCopyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus("Share link copied to clipboard.");
    } catch {
      setStatus("Couldn't copy automatically - select the link above.");
    }
  }

  async function handleGenerateImage() {
    setIsCapturing(true);
    setStatus("Generating image...");
    try {
      // The capture target renders off-screen only while this runs - give
      // React a frame to paint it (and the browser a moment to decode the
      // weapon/buddy images) before html-to-image reads the DOM.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const node = captureRef.current;
      if (!node) throw new Error("capture target missing");

      const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: "#0f1923", cacheBust: true });
      setImageUrl(dataUrl);

      // Copy to clipboard by default, per the intended flow - but this is
      // the part most likely to fail (Firefox has no image clipboard write,
      // and any browser blocks it without a secure context), so a failure
      // here still leaves a usable downloadable image rather than erroring
      // the whole action out.
      try {
        const blob = await (await fetch(dataUrl)).blob();
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setStatus("Image copied to clipboard — paste it anywhere. You can also download it below.");
      } catch {
        setStatus("Image ready — your browser blocked copying it automatically, so use Download below.");
      }
    } catch {
      setStatus("Couldn't generate the image. Try again.");
    } finally {
      setIsCapturing(false);
    }
  }

  /**
   * Positions the panel under the trigger before opening it. Measured at open
   * time rather than tracked continuously: the panel closes on any outside
   * click, so there is no state in which it needs to follow a moving trigger,
   * and clamping here keeps it on screen for a card near the right edge.
   */
  function openPanel() {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const GAP = 8;
      const EDGE = 8;
      // Flip above the trigger when there is not room below it. Clamping only
      // the top edge would leave most of a fixed-position panel below the
      // fold with no way to reach it: scrolling moves the page, not the panel.
      const roomBelow = window.innerHeight - rect.bottom - GAP;
      const top =
        roomBelow >= PANEL_MAX_HEIGHT
          ? rect.bottom + GAP
          : Math.max(EDGE, rect.top - GAP - PANEL_MAX_HEIGHT);
      setPanelPos({
        top: Math.max(EDGE, Math.min(top, window.innerHeight - EDGE - PANEL_MAX_HEIGHT)),
        // Also clamped low, so a viewport narrower than the panel pins it to
        // the left edge rather than pushing it off the right.
        left: Math.max(EDGE, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - EDGE)),
      });
    }
    setIsOpen(true);
  }

  // Measured once at open time, so scrolling or resizing would leave a fixed
  // panel floating over unrelated cards - the click-catcher does not block
  // wheel events from scrolling the page beneath it. Closing is the honest
  // response: the panel is anchored to a trigger it can no longer track.
  useEffect(() => {
    if (!isOpen) return;
    panelRef.current?.focus();
    const close = () => setIsOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [isOpen]);

  const triggerClass =
    variant === "inline"
      ? "text-muted hover:text-foreground transition-colors"
      : "clip-notch-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest text-muted hover:text-foreground hover:border-foreground/30 transition-colors";

  // The popover is portalled to <body> rather than positioned inside the
  // trigger's own subtree. Loadout cards use `.clip-notch`, and a non-none
  // `clip-path` clips the element's whole painted subtree - so a popover
  // rendered inside a card is cut off at the card's edge whatever its z-index
  // or positioning. Leaving the clipped subtree is the only fix.
  const panel = isOpen ? (
    <>
      {/* Click-outside catcher */}
      <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={`Share ${loadout.name}`}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setIsOpen(false);
            triggerRef.current?.focus();
          }
        }}
        // Portalling puts this after every other focusable element on the
        // page, so focus is moved here explicitly on open and returned to the
        // trigger on Escape - otherwise reaching it by keyboard means tabbing
        // past every remaining card.
        className="fixed z-50 w-80 overflow-y-auto border border-accent bg-surface p-4 shadow-xl text-left"
        style={{ top: panelPos.top, left: panelPos.left, maxHeight: PANEL_MAX_HEIGHT }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Share link</p>
        {shareUrl ? (
          <>
            <p className="mt-1.5 break-all rounded-none border border-border bg-background px-2 py-1.5 text-[11px] text-foreground">
              {shareUrl}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleCopyLink}
                className="clip-notch-sm flex-1 bg-accent py-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent-contrast hover:bg-accent-dark transition-colors"
              >
                Copy link
              </button>
              <button
                onClick={handleRevoke}
                disabled={isPending}
                className="clip-notch-sm flex-1 border border-border py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-accent hover:border-accent/40 transition-colors disabled:opacity-50"
              >
                Turn off
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted">
              This loadout is private. Creating a link makes it viewable by anyone who has it.
            </p>
            <button
              onClick={handleCreateLink}
              disabled={isPending}
              className="clip-notch-sm mt-2 w-full bg-accent py-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent-contrast hover:bg-accent-dark transition-colors disabled:opacity-50"
            >
              {isPending ? "Creating..." : "Create share link"}
            </button>
          </>
        )}

        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">Share as image</p>
        <button
          onClick={handleGenerateImage}
          disabled={isCapturing}
          className="clip-notch-sm mt-1.5 w-full border border-border py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
        >
          {isCapturing ? "Generating..." : "Generate image & copy"}
        </button>
        {imageUrl ? (
          <a
            href={imageUrl}
            download={`${loadout.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-loadout.png`}
            className="clip-notch-sm mt-2 block w-full border border-border py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            Download image
          </a>
        ) : null}

        {status ? <p className="mt-3 text-[11px] leading-relaxed text-foreground">{status}</p> : null}
      </div>
    </>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={openPanel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={triggerClass}
      >
        Share
      </button>

      {/* `panel` is null until the trigger is clicked, so this never runs
          during the server render and needs no mounted guard. */}
      {panel ? createPortal(panel, document.body) : null}

      {/* Off-screen capture target. Only mounted while generating, so the
          normal page never pays to render a second full board. Positioned
          rather than display:none - html-to-image needs real layout. */}
      {isCapturing ? (
        <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }} aria-hidden>
          <div ref={captureRef}>
            <LoadoutShareImage loadout={loadout} weapons={weapons} />
          </div>
        </div>
      ) : null}
    </>
  );
}
