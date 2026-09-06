import Image from "next/image";
import Link from "next/link";
import { SkinPreview } from "@/components/gallery/SkinPreview";
import { WishlistButton } from "@/components/gallery/WishlistButton";
import { resolveSkinPrice } from "@/lib/pricing";
import { getPriceEstimates } from "@/queries/prices";
import { tierColorToCss } from "@/lib/tierColor";
import type { Prisma } from "@/generated/prisma/client";

type SkinDetail = Prisma.SkinGetPayload<{
  include: { weapon: true; contentTier: true; theme: true; levels: true; chromas: true; vibeTags: true };
}>;

interface SkinDetailViewProps {
  skin: SkinDetail;
  // Only the selected buddy - see getBuddy(). Narrowed to the fields
  // actually rendered so this cannot drift back to a full-table read.
  buddy: { id: string; displayName: string; displayIconUrl: string | null } | null;
  // Set when arriving via a /combo/:encoded share link, to pre-select that
  // exact level/chroma/buddy combo instead of the skin's defaults.
  initialLevelId?: string | null;
  initialChromaId?: string | null;
  initialBuddyId?: string | null;
  loadoutContext?: { loadoutId: string; weaponId: string; loadoutName: string };
  backHref?: string;
  backLabel?: string;
  // Omitted on the loadout-assignment reuse of this view (see
  // /loadouts/[id]/weapon/[weaponId]/skins/[skinId]) - wishlisting isn't the
  // point of that flow, "Add to Loadout" is.
  wishlist?: { isWishlisted: boolean; isSignedIn: boolean };
  // Passed through to SkinPreview's gallery-side "add to loadout" control.
  loadouts?: { id: string; name: string }[] | null;
  // Loadouts this skin is already assigned in, shown so the two features
  // aren't blind to each other.
  inLoadouts?: string[];
}

// Shared by the normal gallery detail page (/skins/[id]) and the stateless
// combo share-link page (/combo/[encoded]) - see docs/ARCHITECTURE.md "Sharing".
//
// The static info panel (tier/name/stats/vibe tags) is built here on the
// server and passed as children into SkinPreview, which is a client
// component - that's what lets the sidebar hold both this info AND the
// interactive level/chroma/buddy controls in one panel next to the media,
// instead of splitting them across two mismatched columns.
export async function SkinDetailView({
  skin,
  buddy,
  initialLevelId,
  initialChromaId,
  initialBuddyId,
  loadoutContext,
  backHref = "/",
  backLabel = "← Back to gallery",
  wishlist,
  loadouts,
  inLoadouts,
}: SkinDetailViewProps) {
  const price = resolveSkinPrice(skin, await getPriceEstimates());
  const tierColor = tierColorToCss(skin.contentTier?.highlightColor);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href={backHref}
        className="text-xs font-semibold uppercase tracking-widest text-muted hover:text-accent transition-colors"
      >
        {backLabel}
      </Link>

      <div className="mt-4">
        <SkinPreview
          key={skin.id}
          skin={skin}
          buddy={buddy}
          initialLevelId={initialLevelId}
          initialChromaId={initialChromaId}
          initialBuddyId={initialBuddyId}
          loadoutContext={loadoutContext}
          loadouts={loadouts}
        >
          <div className="flex items-center gap-2">
            {skin.contentTier?.displayIconUrl ? (
              <div className="p-1" style={{ backgroundColor: tierColor ?? "rgba(0,0,0,0.3)" }}>
                <Image
                  src={skin.contentTier.displayIconUrl}
                  alt={skin.contentTier.displayName}
                  width={16}
                  height={16}
                />
              </div>
            ) : null}
            <span className="text-xs font-semibold uppercase tracking-widest text-muted">
              {skin.contentTier?.displayName ?? "Unknown Tier"}
            </span>
          </div>

          <h1 className="mt-2 font-display text-4xl uppercase tracking-wide leading-none">{skin.displayName}</h1>

          {wishlist ? (
            <div className="mt-4">
              <WishlistButton
                skinId={skin.id}
                initialWishlisted={wishlist.isWishlisted}
                isSignedIn={wishlist.isSignedIn}
                variant="labeled"
              />
            </div>
          ) : null}

          {inLoadouts && inLoadouts.length > 0 ? (
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
              In your {inLoadouts.join(", ")} loadout{inLoadouts.length > 1 ? "s" : ""}
            </p>
          ) : null}

          <dl className="mt-5 space-y-0">
            <div className="flex justify-between border-b border-border py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Weapon</dt>
              <dd className="text-sm font-semibold">{skin.weapon?.displayName ?? "—"}</dd>
            </div>
            <div className="flex justify-between border-b border-border py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Collection</dt>
              <dd className="text-sm font-semibold">{skin.theme?.displayName ?? "—"}</dd>
            </div>
            {/* The label is now conditional. It used to always read
                "Price (est.)" - which was both wrong when we have a real
                Riot price, and misleadingly reassuring when the estimate
                was off by thousands of VP. */}
            <div className="flex justify-between border-b border-border py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {price && price.source !== "actual" ? "Price (est.)" : "Price"}
              </dt>
              {/* "Unknown", not "not sold" - we genuinely can't tell those
                  apart. Riot withdrew the catalogue price endpoint, so an
                  absent price means "never observed in a shop or bundle we've
                  read", which includes plenty of skins that are on sale. */}
              <dd className="text-sm font-semibold text-accent">
                {price
                  ? `${price.vp.toLocaleString()}${price.vpMax === undefined ? "" : `–${price.vpMax.toLocaleString()}`} VP`
                  : "Unknown"}
              </dd>
            </div>
            {price?.source === "estimate" ? (
              <p className="pt-2 text-[11px] leading-snug text-muted">
                Estimated from this skin&rsquo;s rarity. A confirmed price appears once this skin has shown up
                in a shop or bundle we&rsquo;ve read.
              </p>
            ) : null}
            {price?.source === "range" ? (
              <p className="pt-2 text-[11px] leading-snug text-muted">
                Skins of this rarity aren&rsquo;t all one price. Every one we&rsquo;ve seen Riot charge for has
                fallen in this range; the exact figure appears once this skin itself shows up in a shop or
                bundle we read.
              </p>
            ) : null}
            {!price ? (
              <p className="pt-2 text-[11px] leading-snug text-muted">
                No confirmed price yet, and this skin&rsquo;s rarity doesn&rsquo;t have a fixed price we can
                estimate from. It&rsquo;ll fill in once the skin appears in a shop or bundle we read.
              </p>
            ) : null}
            {skin.colorFamily ? (
              <div className="flex justify-between border-b border-border py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Color</dt>
                <dd className="text-sm font-semibold capitalize">{skin.colorFamily}</dd>
              </div>
            ) : null}
          </dl>

          {skin.vibeTags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {skin.vibeTags.map((vt) => (
                <span
                  key={vt.tag}
                  className="clip-notch-sm border border-accent/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted"
                >
                  {vt.tag}
                </span>
              ))}
            </div>
          ) : null}
        </SkinPreview>
      </div>
    </div>
  );
}
