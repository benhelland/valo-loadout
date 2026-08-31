"use client";

import { useState, useTransition, type MouseEvent } from "react";
import Link from "next/link";
import { addToWishlist, removeFromWishlist } from "@/actions/wishlist";

interface WishlistButtonProps {
  skinId: string;
  initialWishlisted: boolean;
  isSignedIn: boolean;
  // "icon": compact heart overlay for gallery cards. "labeled": full button
  // with text, for the skin detail page where it's the primary action.
  variant?: "icon" | "labeled";
}

// Used from two places: SkinCard (icon variant, overlaid on the card) and
// SkinDetailView (labeled variant). Optimistic - flips immediately and only
// reverts if the server action actually fails, since a wishlist toggle
// should feel instant, not round-trip-gated.
export function WishlistButton({ skinId, initialWishlisted, isSignedIn, variant = "icon" }: WishlistButtonProps) {
  const [wishlisted, setWishlisted] = useState(initialWishlisted);
  const [isPending, startTransition] = useTransition();

  if (!isSignedIn) {
    // Icon cards stay clean for anonymous browsing rather than showing a
    // button that just bounces to sign-in on every card - the labeled
    // variant (skin detail page) is where wishlisting is actually offered
    // to a signed-out visitor.
    if (variant === "icon") return null;
    return (
      <Link
        href="/sign-in"
        className="clip-notch-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest text-muted hover:border-accent hover:text-foreground transition-colors"
      >
        Sign in to wishlist
      </Link>
    );
  }

  function toggle(event: MouseEvent) {
    // SkinCard overlays this on top of a Link that covers the whole card -
    // stop the click from also triggering that navigation.
    event.preventDefault();
    event.stopPropagation();

    const next = !wishlisted;
    setWishlisted(next);
    startTransition(async () => {
      try {
        await (next ? addToWishlist(skinId) : removeFromWishlist(skinId));
      } catch {
        setWishlisted(!next);
      }
    });
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
        aria-pressed={wishlisted}
        className={`absolute top-2 left-2 z-10 flex h-6 w-6 items-center justify-center rounded-full backdrop-blur-sm transition-colors disabled:opacity-50 ${
          wishlisted ? "bg-accent text-background" : "bg-black/40 text-white hover:bg-black/60"
        }`}
      >
        <svg
          viewBox="0 0 20 20"
          fill={wishlisted ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.5}
          className="h-3.5 w-3.5"
        >
          <path d="M10 17.5s-6.5-4.06-8.5-8.06C.4 6.6 1.8 3.5 5 3.5c2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 3.2 0 4.6 3.1 3.5 5.94C16.5 13.44 10 17.5 10 17.5z" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      className={`clip-notch-sm border px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-colors disabled:opacity-50 ${
        wishlisted
          ? "border-accent bg-accent text-background"
          : "border-border text-muted hover:border-accent hover:text-foreground"
      }`}
    >
      {wishlisted ? "★ On your wishlist" : "☆ Add to wishlist"}
    </button>
  );
}
