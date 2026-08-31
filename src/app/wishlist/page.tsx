import Link from "next/link";
import { getCurrentUserId } from "@/lib/auth";
import { listWishlistSkins } from "@/queries/wishlist";
import { SkinCard } from "@/components/gallery/SkinCard";

// Protected by src/proxy.ts's matcher (/wishlist/:path*) - getCurrentUserId()
// below is the defense-in-depth backstop, same pattern as /loadouts and
// /account.
export default async function WishlistPage() {
  const userId = await getCurrentUserId();
  const { skins, totalVp } = await listWishlistSkins(userId);

  return (
    <div className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex flex-wrap items-baseline gap-4 border-l-4 border-accent pl-4">
        <h1 className="font-display text-5xl uppercase tracking-wide leading-none">Wishlist</h1>
        <p className="text-sm uppercase tracking-wide text-muted">
          {skins.length} {skins.length === 1 ? "skin" : "skins"}
          {skins.length > 0 ? ` · ${totalVp.toLocaleString()} VP est.` : ""}
        </p>
      </div>

      {skins.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-muted">
            Nothing here yet. Add a skin from{" "}
            <Link href="/" className="underline hover:text-accent">
              the gallery
            </Link>{" "}
            and we&rsquo;ll DM you on Discord when it shows up in your shop (once you&rsquo;ve linked a Riot
            account on{" "}
            <Link href="/account" className="underline hover:text-accent">
              your account
            </Link>
            ).
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {skins.map((skin) => (
            <SkinCard key={skin.id} skin={skin} wishlist={{ isWishlisted: true, isSignedIn: true }} />
          ))}
        </div>
      )}
    </div>
  );
}
