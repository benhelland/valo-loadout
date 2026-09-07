import Link from "next/link";
import { getCurrentUserId } from "@/lib/auth";
import { getShopForUser } from "@/queries/shop";
import { SkinCard } from "@/components/gallery/SkinCard";
import { CheckShopNowButton } from "@/components/account/CheckShopNowButton";

export const metadata = { title: "Your Shop · Valoadout" };

function relative(date: Date): string {
  const mins = Math.round((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function until(date: Date): string {
  const mins = Math.round((date.getTime() - Date.now()) / 60_000);
  if (mins <= 0) return "due now";
  if (mins < 60) return `in ${mins}m`;
  return `in ${Math.round(mins / 60)}h`;
}

// Protected by src/proxy.ts's matcher; getCurrentUserId() is the backstop.
export default async function ShopPage() {
  const userId = await getCurrentUserId();
  const shop = await getShopForUser(userId);
  const accountId = shop.accountId;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 border-l-4 border-accent pl-4">
        <h1 className="font-display text-5xl uppercase tracking-wide leading-none">Your Shop</h1>
        {shop.riotId ? <p className="mt-2 text-sm text-muted">{shop.riotId}</p> : null}
      </div>

      {!shop.linked ? (
        <section className="clip-notch border border-border bg-surface p-6">
          <p className="text-sm text-muted">
            Link a Riot account to see your daily shop here. You sign in on Riot&rsquo;s own page - we never
            see your password.
          </p>
          <Link
            href="/account"
            className="clip-notch-sm mt-4 inline-flex h-9 items-center bg-accent px-4 text-xs font-bold uppercase tracking-widest text-accent-contrast transition-colors hover:bg-accent-dark"
          >
            Link a Riot account
          </Link>
        </section>
      ) : shop.skins.length === 0 ? (
        <section className="clip-notch border border-border bg-surface p-6">
          <p className="text-sm text-muted">
            {shop.status === "ACTIVE"
              ? "No shop data yet - run a check to pull your current offers."
              : `This account needs attention (${shop.status?.toLowerCase().replace(/_/g, " ")}). Re-link it on your account page.`}
          </p>
          <div className="mt-4 flex items-center gap-3">
            {accountId ? <CheckShopNowButton linkedAccountId={accountId} /> : null}
            <Link href="/account" className="text-xs font-semibold uppercase tracking-widest text-muted hover:text-accent">
              Account settings
            </Link>
          </div>
        </section>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-widest text-muted">
              {shop.lastSyncedAt ? `Checked ${relative(shop.lastSyncedAt)}` : null}
              {shop.nextPollAt ? <span className="ml-3">Next check {until(shop.nextPollAt)}</span> : null}
            </p>
            {accountId ? <CheckShopNowButton linkedAccountId={accountId} /> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {shop.skins.map((skin) => (
              <SkinCard
                key={skin.id}
                skin={skin}
                wishlist={{ isWishlisted: skin.onWishlist, isSignedIn: true }}
                badge={skin.onWishlist ? "On your wishlist" : undefined}
              />
            ))}
          </div>

          <p className="mt-4 text-xs text-muted">
            Your shop rotates roughly every 24 hours. These are the offers from the most recent check.
          </p>
        </>
      )}
    </div>
  );
}
