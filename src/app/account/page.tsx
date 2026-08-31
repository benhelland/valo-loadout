import Image from "next/image";
import { auth } from "@/auth";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { maskEmail } from "@/lib/maskEmail";
import { UnlinkRiotAccountButton } from "@/components/account/UnlinkRiotAccountButton";

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
  const linkedAccounts = await prisma.linkedRiotAccount.findMany({ where: { userId } });

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
              return (
                <div key={account.id} className="clip-notch-sm border border-border bg-background p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm font-semibold ${status.tone}`}>{status.label}</p>
                      <p className="mt-1 text-xs text-muted">
                        {account.lastSyncedAt
                          ? `Last checked ${account.lastSyncedAt.toLocaleString()}`
                          : "Not checked yet"}
                      </p>
                    </div>
                    <UnlinkRiotAccountButton linkedAccountId={account.id} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-muted">
              Linking a Riot account lets valo-loadout check your daily shop and notify you (via a Discord
              webhook) when a wishlisted skin shows up in it.
            </p>

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
                  Your Riot password is used only for the instant it takes to sign you in, then discarded -
                  it is never stored, by us or in our database, in any form.
                </li>
                <li>
                  You can unlink at any time, which deletes the stored session token immediately and stops
                  all checking.
                </li>
              </ul>
            </div>

            <div className="clip-notch-sm mt-4 flex items-center justify-between gap-4 border border-dashed border-border bg-background p-4">
              <p className="text-xs text-muted">
                <span className="font-semibold text-foreground">Coming soon.</span> The account-linking flow
                itself (handling your Riot login, 2FA, and encrypting the resulting session) is still being
                built with the extra security review this specific piece needs before it goes live.
              </p>
              <button
                type="button"
                disabled
                className="clip-notch-sm shrink-0 cursor-not-allowed bg-accent/30 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/50"
              >
                Link Riot account
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
