"use client";

import { useState, useTransition, type MouseEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
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
  const router = useRouter();
  const pathname = usePathname();

  function toggle(event: MouseEvent) {
    // SkinCard overlays this on top of a Link that covers the whole card -
    // stop the click from also triggering that navigation.
    event.preventDefault();
    event.stopPropagation();

    // Signed-out visitors still see (and can click) the heart. It used to
    // render nothing at all for them, which meant the app's headline
    // feature was completely invisible to every first-time visitor
    // browsing the gallery - and browsing anonymously is the intended
    // front door. Clicking is the natural moment to ask for sign-in, and
    // callbackUrl brings them straight back to what they were looking at.
    if (!isSignedIn) {
      router.push(`/sign-in?callbackUrl=${encodeURIComponent(pathname)}`);
      return;
    }

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
        aria-label={
          !isSignedIn ? "Sign in to wishlist" : wishlisted ? "Remove from wishlist" : "Add to wishlist"
        }
        aria-pressed={isSignedIn ? wishlisted : undefined}
        className={`group/heart absolute top-2 left-2 z-10 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-sm transition-[background-color,transform,box-shadow] duration-150 hover:scale-110 active:scale-95 disabled:opacity-50 ${
          wishlisted
            ? "bg-accent text-accent-contrast shadow-[0_0_0_1px_var(--accent)]"
            : "bg-black/40 text-white hover:bg-accent hover:text-accent-contrast hover:shadow-[0_0_12px_-2px_var(--accent)]"
        }`}
      >
        <svg
          viewBox="0 0 20 20"
          stroke="currentColor"
          strokeWidth={1.5}
          // Hover previews the committed state: the outline fills in, so it
          // is obvious what the click will do before making it. `fill` is
          // driven by a class rather than the attribute so CSS can change it
          // on hover without a re-render.
          className={`h-4 w-4 transition-[fill,transform] duration-150 group-hover/heart:scale-110 ${
            wishlisted ? "fill-current" : "fill-transparent group-hover/heart:fill-current"
          } ${isPending ? "animate-pulse" : ""}`}
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
      className={`clip-notch-sm border px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-[background-color,border-color,color,box-shadow] duration-150 disabled:opacity-50 ${
        wishlisted
          ? "border-accent bg-accent text-accent-contrast hover:bg-accent-dark hover:border-accent-dark"
          : "border-border text-muted hover:border-accent hover:text-foreground hover:shadow-[0_0_14px_-4px_var(--accent)]"
      } ${isPending ? "animate-pulse" : ""}`}
    >
      {!isSignedIn ? "☆ Add to wishlist" : wishlisted ? "★ On your wishlist" : "☆ Add to wishlist"}
    </button>
  );
}
