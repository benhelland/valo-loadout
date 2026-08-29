import Image from "next/image";
import Link from "next/link";
import { tierColorToCss } from "@/lib/tierColor";
import { estimatePriceVp } from "@/lib/pricing";
import type { Prisma } from "@/generated/prisma/client";

type SkinWithRelations = Prisma.SkinGetPayload<{
  include: { weapon: true; contentTier: true; theme: true };
}>;

interface SkinCardProps {
  skin: SkinWithRelations;
  // Where clicking the card links to - defaults to the normal skin detail
  // page. The loadout picker overrides this to route into its own
  // assign-to-slot flow instead (see /loadouts/[id]/weapon/[weaponId]).
  hrefBase?: string;
}

export function SkinCard({ skin, hrefBase = "/skins" }: SkinCardProps) {
  const price = estimatePriceVp(skin.contentTier?.devName);
  const tierColor = tierColorToCss(skin.contentTier?.highlightColor);

  return (
    <Link
      href={`${hrefBase}/${skin.id}`}
      className="clip-notch-sm group block border border-border bg-surface hover:bg-surface-hover hover:border-accent/50 transition-colors"
    >
      <div className="relative aspect-[4/3] bg-black/20">
        {skin.displayIconUrl ? (
          <Image
            src={skin.displayIconUrl}
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
  );
}
