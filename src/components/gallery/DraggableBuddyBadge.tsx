"use client";

import { useRef, useState } from "react";
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

interface DraggableBuddyBadgeProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  displayIconUrl: string;
  displayName: string;
  // True while the Animation tab is active - the badge snaps to the default
  // top-right position/size and stops being interactive (dragging over
  // playing video is a distraction, and there's no reason to fine-tune
  // placement against a still that isn't currently shown). Whatever the
  // user had set in Image mode is kept in state underneath and reappears
  // exactly as left the moment they switch back - see SkinPreview.tsx.
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
  const dragRef = useRef<{ mode: "move" | "resize"; startClientX: number; startClientY: number; startState: BadgeState } | null>(null);

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
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }

  function startDrag(mode: "move" | "resize", e: React.PointerEvent) {
    if (locked) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { mode, startClientX: e.clientX, startClientY: e.clientY, startState: state };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  const effective = locked ? DEFAULT_STATE : state;

  return (
    <div
      onPointerDown={(e) => startDrag("move", e)}
      title={displayName}
      className={`absolute rounded-full border-2 border-accent/60 bg-black/60 shadow-lg backdrop-blur-sm ${
        locked ? "" : "cursor-grab active:cursor-grabbing"
      }`}
      style={{
        left: `${effective.xPct}%`,
        top: `${effective.yPct}%`,
        width: effective.size,
        height: effective.size,
        padding: Math.round(effective.size * 0.1),
        transform: "translate(-50%, -50%)",
        touchAction: "none",
      }}
    >
      <div className="relative h-full w-full">
        <Image src={displayIconUrl} alt={displayName} fill sizes={`${MAX_SIZE}px`} className="pointer-events-none object-contain" />
      </div>

      {locked ? null : (
        <div
          onPointerDown={(e) => startDrag("resize", e)}
          title="Resize"
          className="absolute bottom-0 right-0 h-4 w-4 translate-x-1/3 translate-y-1/3 cursor-nwse-resize rounded-full border border-white/50 bg-accent"
        />
      )}
    </div>
  );
}
