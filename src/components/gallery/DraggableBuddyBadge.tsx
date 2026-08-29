"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

// Center position as a % of the container's own width/height (not pixels) -
// scales naturally with the container instead of needing to know its exact
// size up front. Size is in pixels: a % diameter would make the "reasonable
// min/max" ask meaningless (max would mean something different on every
// screen), so this is the one dimension kept absolute.
interface BadgeState {
  xPct: number;
  yPct: number;
  size: number;
}

const DEFAULT_STATE: BadgeState = { xPct: 88, yPct: 14, size: 96 };
const MIN_SIZE = 48;
const MAX_SIZE = 180;
// How long the circular backing + resize grip stay visible before fading -
// on first appearing (mount, or coming back from the Animation tab) and
// again after each drag/resize interaction ends. The buddy icon itself is
// never affected - only this "chrome" around it fades.
const CHROME_REVEAL_MS = 1500;

interface DraggableBuddyBadgeProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  displayIconUrl: string;
  displayName: string;
  // True while the Animation tab is active - the badge snaps to the default
  // top-right position/size and stops being interactive, and always shows
  // full chrome opacity there (matching the old always-on treatment -
  // dragging over playing video is a distraction, and there's no reason to
  // fine-tune placement against a still that isn't currently shown).
  // Whatever the user had set in Image mode is kept in state underneath and
  // reappears exactly as left the moment they switch back - see
  // SkinPreview.tsx.
  locked: boolean;
}

// A moveable, resizable "fidget" version of the buddy badge - drag to
// reposition anywhere within the media frame, drag the small grip to
// resize between MIN_SIZE and MAX_SIZE. Position/size live only in this
// component's state: deliberately not persisted anywhere (not localStorage,
// not the URL) - leaving the page and coming back should just show the
// default again, per the request this was built against.
export function DraggableBuddyBadge({ containerRef, displayIconUrl, displayName, locked }: DraggableBuddyBadgeProps) {
  const [state, setState] = useState<BadgeState>(DEFAULT_STATE);
  const [chromeVisible, setChromeVisible] = useState(true);
  // Bumping this (re)starts the reveal-then-fade cycle; the effect below is
  // keyed on it.
  const [fadeToken, setFadeToken] = useState(0);
  const [wasLocked, setWasLocked] = useState(locked);
  const dragRef = useRef<{ mode: "move" | "resize"; startClientX: number; startClientY: number; startState: BadgeState } | null>(null);
  // Read only inside event handlers/effect callbacks, never during render -
  // guards the fade timer below against hiding the chrome out from under an
  // interaction that was already in progress when it fired.
  const isDraggingRef = useRef(false);

  // Coming back from the Animation tab (locked -> unlocked) re-reveals the
  // chrome. Detected against a tracked previous value and applied during
  // render, not inside an effect - "adjusting state during render" is the
  // supported pattern for this, and this project's lint rules flag a
  // synchronous setState directly in an effect body (see the fade-timer
  // effect below for where that setState correctly *does* belong - inside
  // the timeout callback, not the effect body itself).
  if (wasLocked !== locked) {
    setWasLocked(locked);
    if (!locked) {
      setChromeVisible(true);
      setFadeToken((t) => t + 1);
    }
  }

  // Fires once on mount (handles first page load) and again whenever
  // fadeToken bumps (unlocking, or a drag/resize interaction ending).
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isDraggingRef.current) setChromeVisible(false);
    }, CHROME_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [fadeToken]);

  function clamp(xPct: number, yPct: number, size: number): BadgeState {
    const container = containerRef.current;
    if (!container) return { xPct, yPct, size };
    const rect = container.getBoundingClientRect();
    const halfWPct = rect.width > 0 ? (size / 2 / rect.width) * 100 : 0;
    const halfHPct = rect.height > 0 ? (size / 2 / rect.height) * 100 : 0;
    return {
      size,
      xPct: Math.min(100 - halfWPct, Math.max(halfWPct, xPct)),
      yPct: Math.min(100 - halfHPct, Math.max(halfHPct, yPct)),
    };
  }

  function onPointerMove(e: PointerEvent) {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (!drag || !container) return;
    const rect = container.getBoundingClientRect();
    const dxPct = ((e.clientX - drag.startClientX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startClientY) / rect.height) * 100;

    if (drag.mode === "move") {
      setState(clamp(drag.startState.xPct + dxPct, drag.startState.yPct + dyPct, drag.startState.size));
    } else {
      // Resize handle sits at the bottom-right, so dragging down-right
      // (either axis) grows the badge - average the two deltas into one
      // pixel offset for a natural diagonal-drag feel.
      const pixelDelta = (e.clientX - drag.startClientX + (e.clientY - drag.startClientY)) / 2;
      const nextSize = Math.min(MAX_SIZE, Math.max(MIN_SIZE, drag.startState.size + pixelDelta));
      setState(clamp(drag.startState.xPct, drag.startState.yPct, nextSize));
    }
  }

  function onPointerUp() {
    dragRef.current = null;
    isDraggingRef.current = false;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    setFadeToken((t) => t + 1); // start a fresh reveal window now that the interaction is over
  }

  function startDrag(mode: "move" | "resize", e: React.PointerEvent) {
    if (locked) return;
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    setChromeVisible(true);
    dragRef.current = { mode, startClientX: e.clientX, startClientY: e.clientY, startState: state };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  const effective = locked ? DEFAULT_STATE : state;
  const showChrome = locked || chromeVisible;

  return (
    <div
      onPointerDown={(e) => startDrag("move", e)}
      title={displayName}
      className={`absolute ${locked ? "" : "cursor-grab active:cursor-grabbing"}`}
      style={{
        left: `${effective.xPct}%`,
        top: `${effective.yPct}%`,
        width: effective.size,
        height: effective.size,
        transform: "translate(-50%, -50%)",
        touchAction: "none",
      }}
    >
      {/* Chrome - the circular backing, border, and shadow. Fades
          independently of the buddy icon itself, which stays fully visible
          throughout. Dragging (on this div or the resize grip below) still
          works even while faded - the fade is purely visual. No transition
          while locked (Animation tab) - it should snap to solid instantly,
          not visibly fade in, when the tab is switched. */}
      <div
        aria-hidden
        className={`absolute inset-0 rounded-full border-2 border-accent/60 bg-black/60 shadow-lg backdrop-blur-sm ${
          locked ? "" : "transition-opacity duration-700"
        }`}
        style={{ opacity: showChrome ? 1 : 0 }}
      />

      <div className="relative h-full w-full" style={{ padding: Math.round(effective.size * 0.1) }}>
        <Image src={displayIconUrl} alt={displayName} fill sizes={`${MAX_SIZE}px`} className="pointer-events-none object-contain" />
      </div>

      {locked ? null : (
        <div
          onPointerDown={(e) => startDrag("resize", e)}
          title="Resize"
          className="absolute bottom-0 right-0 flex h-6 w-6 translate-x-1/3 translate-y-1/3 items-center justify-center rounded-full border border-white/50 bg-accent text-white cursor-nwse-resize transition-opacity duration-700"
          style={{ opacity: showChrome ? 1 : 0, pointerEvents: showChrome ? "auto" : "none" }}
        >
          {/* Diagonal double-arrow - reads as "resize" much more clearly
              than a plain dot did. */}
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 3l-7 7M21 3v5M21 3h-5" />
            <path d="M3 21l7-7M3 21v-5M3 21h5" />
          </svg>
        </div>
      )}
    </div>
  );
}
