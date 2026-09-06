import Image from "next/image";
import Link from "next/link";
import { tierColorToCss } from "@/lib/tierColor";
import { resolveSkinPrice } from "@/lib/pricing";
import { getPriceEstimates } from "@/queries/prices";
import { WishlistButton } from "@/components/gallery/WishlistButton";
import type { Prisma } from "@/generated/prisma/client";

type SkinWithRelations = Prisma.SkinGetPayload<{
  include: { weapon: true; contentTier: true; theme: true; levels: true; chromas: true };
}>;

interface SkinCardProps {
  skin: SkinWithRelations;
  // Where clicking the card links to - defaults to the normal skin detail
  // page. The loadout picker overrides this to route into its own
  // assign-to-slot flow instead (see /loadouts/[id]/weapon/[weaponId]).
  hrefBase?: string;
  // The active color filter value, if any (e.g. "green"). When the skin's
  // base look doesn't carry that color but one of its recolors does, show
  // and link to that specific chroma instead of the default - otherwise
  // filtering by "green" could still show a red card, which is confusing.
  matchColor?: string;
  // Omitted entirely (not just false) by call sites where wishlisting
  // doesn't make sense - the loadout picker reuses this same card for
  // "assign to slot", where a wishlist heart would be a non-sequitur.
  wishlist?: { isWishlisted: boolean; isSignedIn: boolean };
  // Short marker rendered under the name, e.g. the wishlist page's "In
  // <loadout>" cross-reference. Kept as a plain string so the card stays
  // agnostic about what's being cross-referenced.
  badge?: string;
}

// Async server component. getPriceEstimates is React-cached, so rendering
// a full grid of these still runs exactly one query per request.
export async function SkinCard({ skin, hrefBase = "/skins", matchColor, wishlist, badge }: SkinCardProps) {
  const price = resolveSkinPrice(skin, await getPriceEstimates());
  // Full opacity, not the API's own 0.2 alpha: this is the card's rarity
  // signal, so it has to actually read. Rarity is the primary way people
  // sort skins mentally, and it was previously communicated only by a 12px
  // icon on a 20%-opacity wash - effectively invisible across a grid.
  const tierColor = tierColorToCss(skin.contentTier?.highlightColor, 1);
  const tierGlow = tierColorToCss(skin.contentTier?.highlightColor, 0.28);

  // Only override anything when the base chroma (chromas[0], the default
  // look) ISN'T what matched the filter - the common case (base already
  // matches, or no color filter at all) stays on the untouched path below.
  const matchedChroma = matchColor ? skin.chromas.find((c) => c.colorFamily === matchColor) : undefined;
  const showingMatchedChroma = matchedChroma !== undefined && matchedChroma.id !== skin.chromas[0]?.id;

  // The skin's own displayIconUrl is null for some real skins (confirmed:
  // 47). Fall back to the highest level we have of the base chroma, ordered
  // so levels[0] is the highest level and chromas[0] is the base/default one.
  const imageUrl = showingMatchedChroma
    ? (matchedChroma.displayIconUrl ?? matchedChroma.fullRenderUrl ?? skin.displayIconUrl ?? skin.levels[0]?.displayIconUrl)
    : (skin.displayIconUrl ?? skin.levels[0]?.displayIconUrl ?? skin.chromas[0]?.fullRenderUrl ?? skin.chromas[0]?.displayIconUrl);

  const href = showingMatchedChroma ? `${hrefBase}/${skin.id}?chromaId=${matchedChroma.id}` : `${hrefBase}/${skin.id}`;

  return (
    <div className="relative">
      {wishlist ? (
        <WishlistButton
          skinId={skin.id}
          initialWishlisted={wishlist.isWishlisted}
          isSignedIn={wishlist.isSignedIn}
          variant="icon"
        />
      ) : null}
      <Link
        href={href}
        style={
          {
            // Driven by data we already sync but previously barely used. The
            // hover glow is the tier's own hue rather than a global accent,
            // so hovering reinforces rarity instead of overriding it.
            "--tier": tierColor ?? "var(--border)",
            "--tier-glow": tierGlow ?? "transparent",
          } as React.CSSProperties
        }
        // `card-skip` lets the browser skip layout and paint for cards that
        // are off-screen (see globals.css) - the single biggest cost in a
        // 48-to-192 card grid. The transition is enumerated rather than
        // `transition-all`, which makes the browser watch every animatable
        // property on every card and is a real cost during scroll.
        className="clip-notch-sm card-skip group block border border-border border-t-[3px] border-t-[var(--tier)] bg-surface transition-[background-color,border-color,box-shadow] duration-150 hover:bg-surface-hover hover:border-[var(--tier)] hover:shadow-[0_0_0_1px_var(--tier-glow),0_6px_20px_-6px_var(--tier-glow)]"
      >
        <div className="relative aspect-[4/3] bg-black/20">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={skin.displayName}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              className="object-contain p-4 group-hover:scale-105 transition-transform duration-200"
            />
          ) : null}
          {skin.contentTier?.displayIconUrl ? (
            <Image
              src={skin.contentTier.displayIconUrl}
              alt={skin.contentTier.displayName}
              width={14}
              height={14}
              // No tinted plate behind it any more - the top border now
              // carries the rarity colour, so the icon only has to say
              // *which* tier, not shout that there is one.
              className="absolute top-2 right-2 opacity-80"
            />
          ) : null}
        </div>
        <div className="p-3 border-t border-border">
          <p className="text-sm font-semibold truncate">{skin.displayName}</p>
          <div className="mt-1 flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-muted">
            <span className="truncate">{skin.weapon?.displayName ?? "—"}</span>
            {/* Deliberately NOT accent-red here. One red price is a
                highlight; thirty of them in a grid is just noise competing
                with the skin art, which is the actual content.
                A "~" prefix marks an estimate, so a real Riot price and a
                guess are never presented as the same thing. */}
            {price ? (
              <span
                className="shrink-0 text-foreground/80"
                title={
                  price.source === "actual"
                    ? "Confirmed price from Riot's store"
                    : price.source === "range"
                      ? "Every skin of this rarity we've seen priced fell in this range"
                      : "Estimated from rarity - not a confirmed price"
                }
              >
                {price.source === "actual" ? "" : "~"}
                {price.vp.toLocaleString()}
                {price.vpMax === undefined ? "" : `-${price.vpMax.toLocaleString()}`} VP
              </span>
            ) : null}
          </div>
          {badge ? (
            <p className="mt-1.5 truncate text-[10px] font-semibold uppercase tracking-wider text-muted">{badge}</p>
          ) : null}
        </div>
      </Link>
    </div>
  );
}
