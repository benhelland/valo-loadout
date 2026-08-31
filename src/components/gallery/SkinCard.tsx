import Image from "next/image";
import Link from "next/link";
import { tierColorToCss } from "@/lib/tierColor";
import { estimatePriceVp } from "@/lib/pricing";
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
}

export function SkinCard({ skin, hrefBase = "/skins", matchColor, wishlist }: SkinCardProps) {
  const price = estimatePriceVp(skin.contentTier?.devName);
  const tierColor = tierColorToCss(skin.contentTier?.highlightColor);

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
        className="clip-notch-sm group block border border-border bg-surface hover:bg-surface-hover hover:border-accent/50 transition-colors"
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
          {skin.contentTier ? (
            <div
              className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm"
              style={{ backgroundColor: tierColor ?? "rgba(0,0,0,0.4)" }}
            >
              {skin.contentTier.displayIconUrl ? (
                <Image
                  src={skin.contentTier.displayIconUrl}
                  alt={skin.contentTier.displayName}
                  width={12}
                  height={12}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="p-3 border-t border-border">
          <p className="text-sm font-semibold truncate">{skin.displayName}</p>
          <div className="mt-1 flex items-center justify-between text-xs uppercase tracking-wide text-muted">
            <span className="truncate">{skin.weapon?.displayName ?? "—"}</span>
            {price !== null ? <span className="text-foreground/80">{price.toLocaleString()} VP</span> : null}
          </div>
        </div>
      </Link>
    </div>
  );
}
