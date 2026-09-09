import Image from "next/image";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { buildAuthorizeUrl } from "@/riot/oauth";
import { getCurrentUserId } from "@/lib/auth";
import { getAccountOverview } from "@/queries/account";
import { getNotificationStatus } from "@/queries/notifications";
import { maskEmail } from "@/lib/maskEmail";
import { UnlinkRiotAccountButton } from "@/components/account/UnlinkRiotAccountButton";
import { CheckShopNowButton } from "@/components/account/CheckShopNowButton";
import { LinkRiotAccountForm } from "@/components/account/LinkRiotAccountForm";
import { NotificationToggle } from "@/components/account/NotificationToggle";
import { isNotificationDeliveryConfigured } from "@/discord/bot";

// DMS_CLOSED is the only failure the user can act on, so it is the only one
// that gets an instruction.
const DELIVERY_FAILURE_COPY: Record<string, string> = {
  DMS_CLOSED:
    "Discord wouldn't let us DM you. Turn Direct Messages back on for this app's server (Server Settings → Privacy Settings → Direct Messages). The next check that reaches you clears this.",
};
const DELIVERY_FAILURE_FALLBACK =
  "We couldn't reach you on Discord last time. We'll try again on the next shop check.";

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  ACTIVE: { label: "Active", tone: "text-green-400" },
  EXPIRED: { label: "Expired - needs re-linking", tone: "text-amber-400" },
  ERROR: { label: "Error", tone: "text-red-400" },
  CAPTCHA_BLOCKED: { label: "Blocked by CAPTCHA", tone: "text-red-400" },
};

// Protected by src/proxy.ts's matcher (/account/:path*) - getCurrentUserId()
// below is the defense-in-depth backstop, not the only gate.
export default async function AccountPage() {
  const userId = await getCurrentUserId();
  const session = await auth();
  const { linkedAccounts, recentByAccount } = await getAccountOverview(userId);
  const notifications = await getNotificationStatus(userId);
  const deliveryConfigured = isNotificationDeliveryConfigured();

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 border-l-4 border-accent pl-4">
        <h1 className="font-display text-5xl uppercase tracking-wide leading-none">Account</h1>
      </div>

      <section className="clip-notch border border-border bg-surface p-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Signed in via Discord</p>
        <div className="mt-3 flex items-center gap-3">
          {session?.user?.image ? (
            <Image
              src={session.user.image}
              alt={session.user.name ?? "Discord avatar"}
              width={48}
              height={48}
              className="rounded-full"
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-accent/20" />
          )}
          <div>
            <p className="font-display text-2xl uppercase tracking-wide leading-none">{session?.user?.name ?? "—"}</p>
            {session?.user?.email ? <p className="mt-1 text-xs text-muted">{maskEmail(session.user.email)}</p> : null}
          </div>
        </div>
      </section>

      <section className="clip-notch mt-6 border border-border bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl uppercase tracking-wide leading-none">Wishlist Notifications</h2>
            <p className="mt-2 text-sm text-muted">
              A Discord DM when a wishlisted skin turns up in a linked account&rsquo;s daily shop. Warnings
              about a Riot link that has stopped working are sent either way.
            </p>
          </div>
          <NotificationToggle enabled={notifications?.wishlistNotificationsEnabled ?? true} />
        </div>

        {notifications?.notificationFailedAt ? (
          <p className="clip-notch-sm mt-4 border border-amber-500/40 bg-background p-3 text-xs text-amber-300">
            {DELIVERY_FAILURE_COPY[notifications.notificationFailureReason ?? ""] ?? DELIVERY_FAILURE_FALLBACK}
          </p>
        ) : null}
      </section>

      <section className="clip-notch mt-6 border border-border bg-surface p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl uppercase tracking-wide leading-none">Linked Riot Account</h2>
          <span className="clip-notch-sm border border-accent/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            For shop notifications
          </span>
        </div>

        {linkedAccounts.length > 0 ? (
          <div className="mt-4 space-y-3">
            {linkedAccounts.map((account) => {
              const status = STATUS_LABEL[account.status] ?? { label: account.status, tone: "text-muted" };
              const riotId = account.riotGameName
                ? `${account.riotGameName}#${account.riotTagLine ?? "?"}`
                : "Riot account";
              return (
                <div key={account.id} className="clip-notch-sm border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-display text-xl uppercase tracking-wide leading-none">
                        {riotId}
                        {account.region ? (
                          <span className="ml-2 text-xs tracking-widest text-muted">{account.region.toUpperCase()}</span>
                        ) : null}
                      </p>
                      <p className={`mt-2 text-sm font-semibold ${status.tone}`}>{status.label}</p>
                      {/* Only ever a message this codebase authored - never a
                          token or raw upstream error body. */}
                      {account.lastError ? <p className="mt-1 text-xs text-muted">{account.lastError}</p> : null}
                      <p className="mt-1 text-xs text-muted">
                        {account.lastSyncedAt
                          ? `Last checked ${account.lastSyncedAt.toLocaleString()}`
                          : "Not checked yet"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <UnlinkRiotAccountButton linkedAccountId={account.id} />
                      <CheckShopNowButton linkedAccountId={account.id} />
                    </div>
                  </div>

                  {recentByAccount.get(account.id)?.length ? (
                    <div className="mt-4 border-t border-border pt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Most recently seen</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {recentByAccount.get(account.id)!.map((stat) => (
                          <div key={stat.skinId} className="clip-notch-sm border border-border bg-surface p-2">
                            <div className="relative h-12">
                              {stat.skin.displayIconUrl ? (
                                <Image
                                  src={stat.skin.displayIconUrl}
                                  alt={stat.skin.displayName}
                                  fill
                                  sizes="160px"
                                  className="object-contain"
                                />
                              ) : null}
                            </div>
                            <p className="mt-1 truncate text-[10px] text-muted">{stat.skin.displayName}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-muted">
              Linking a Riot account lets Valoadout read your daily shop, so you can see it on the{" "}
              <span className="text-foreground">Your Shop</span> page and get told when a wishlisted skin
              shows up in it.
            </p>

            {/* Notifications and shop viewing are independent: delivery needs
                a Discord bot, reading the shop doesn't. Say which half works
                rather than hiding the feature outright - linking still buys
                the user something real without the bot. */}
            {!deliveryConfigured ? (
              <p className="clip-notch-sm mt-3 border border-border bg-background p-3 text-xs text-muted">
                <span className="font-semibold uppercase tracking-wider text-foreground">Note:</span>{" "}
                Discord notifications aren&rsquo;t switched on yet, so nothing will DM you for now. Linking
                still works - you&rsquo;ll be able to view your shop in the app, and notifications will
                start automatically once they&rsquo;re enabled.
              </p>
            ) : null}

            <div className="clip-notch-sm mt-4 border border-border bg-background p-4 text-xs text-muted">
              <p className="font-semibold uppercase tracking-wider text-foreground">Before you&rsquo;d link an account, know this:</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4">
                <li>
                  This uses the same unofficial method community tools like SkinPeek have used - Riot&rsquo;s own
                  public developer API doesn&rsquo;t support shop tracking. It is <strong>not officially sanctioned</strong>{" "}
                  by Riot, and no evidence exists that it puts accounts at risk, but that could change.
                </li>
                <li>
                  We only ever read your shop&rsquo;s current contents (4 skin IDs, once a day) - never your
                  inventory, match history, or anything else, and we never write to or modify your account
                  in any way.
                </li>
                <li>
                  <strong>We never see your password.</strong> You sign in on Riot&rsquo;s own page and we receive
                  only a short-lived, single-use code, which we exchange for an access token and store encrypted.
                  Your password never reaches our servers, not even for an instant.
                </li>
                <li>
                  You can unlink at any time, which deletes the stored token immediately and stops all
                  checking.
                </li>
              </ul>
            </div>

            <LinkRiotAccountForm authorizeUrl={buildAuthorizeUrl(randomUUID())} />
          </div>
        )}
      </section>
    </div>
  );
}
