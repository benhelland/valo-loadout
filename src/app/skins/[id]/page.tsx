import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getSkinDetail, listBuddies } from "@/queries/gallery";
import { SkinPreview } from "@/components/gallery/SkinPreview";
import { estimatePriceVp } from "@/lib/pricing";
import { tierColorToCss } from "@/lib/tierColor";

export default async function SkinDetailPage({ params }: PageProps<"/skins/[id]">) {
  const { id } = await params;
  const [skin, buddies] = await Promise.all([getSkinDetail(id), listBuddies()]);

  if (!skin) notFound();

  const price = estimatePriceVp(skin.contentTier?.devName);
  const tierColor = tierColorToCss(skin.contentTier?.highlightColor);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/" className="text-sm text-muted hover:text-foreground">
        ← Back to gallery
      </Link>

      <div className="mt-4 grid lg:grid-cols-[3fr_2fr] gap-8">
        <SkinPreview key={skin.id} skin={skin} buddies={buddies} />

        <div>
          <div className="flex items-center gap-2">
            {skin.contentTier?.displayIconUrl ? (
              <div
                className="rounded p-1"
                style={{ backgroundColor: tierColor ?? "rgba(0,0,0,0.3)" }}
              >
                <Image
                  src={skin.contentTier.displayIconUrl}
                  alt={skin.contentTier.displayName}
                  width={16}
                  height={16}
                />
              </div>
            ) : null}
            <span className="text-xs text-muted">{skin.contentTier?.displayName ?? "Unknown Tier"}</span>
          </div>

          <h1 className="mt-2 text-2xl font-semibold">{skin.displayName}</h1>

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between border-b border-border pb-2">
              <dt className="text-muted">Weapon</dt>
              <dd>{skin.weapon?.displayName ?? "—"}</dd>
            </div>
            <div className="flex justify-between border-b border-border pb-2">
              <dt className="text-muted">Collection</dt>
              <dd>{skin.theme?.displayName ?? "—"}</dd>
            </div>
            <div className="flex justify-between border-b border-border pb-2">
              <dt className="text-muted">Price (estimated)</dt>
              <dd>{price !== null ? `${price.toLocaleString()} VP` : "—"}</dd>
            </div>
            {skin.colorFamily ? (
              <div className="flex justify-between border-b border-border pb-2">
                <dt className="text-muted">Color</dt>
                <dd className="capitalize">{skin.colorFamily}</dd>
              </div>
            ) : null}
          </dl>

          {skin.vibeTags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {skin.vibeTags.map((vt) => (
                <span
                  key={vt.tag}
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted capitalize"
                >
                  {vt.tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
