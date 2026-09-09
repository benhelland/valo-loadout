import { prisma } from "@/lib/db";
import { NotificationChannel } from "@/generated/prisma/client";
import { sendDirectMessage, type DeliveryResult } from "@/discord/bot";
import { buildWishlistMatchMessage, buildLinkExpiredMessage } from "@/notifications/messages";
import { siteUrl } from "@/lib/siteUrl";

// The seam between the Discord bot client (src/discord/, no database access)
// and this app's data - dedup state and DB writes live here, same pattern as
// src/store-check/ for the Riot connector. Nothing here can throw out to its
// callers: a notification failure must never turn a successful shop check
// (or sign-in) into a reported failure.

// Shared with robots.txt/sitemap.xml so there is one answer to "what is this
// deployment's public origin". It resolves on a preview deployment too, where
// NEXT_PUBLIC_APP_URL is deliberately unset - a DM linking to localhost would
// be useless.
const APP_URL = siteUrl();

// A shop's contents reset roughly every 24h - this window is what "already
// notified for this shop" means in practice. Wide enough that one cycle
// never double-fires, narrow enough that a skin genuinely reappearing days
// later notifies again. Not tied to the account's actual reset timestamp on
// purpose - a user can have zero or (per the schema) eventually multiple
// linked accounts, and this only needs to be approximately right.
const DEDUPE_WINDOW_MS = 20 * 60 * 60 * 1000;

/**
 * Records whether the last DM reached the user, so /account can say so
 * instead of silently never notifying. NOT_CONFIGURED is skipped: a
 * deployment with no bot token is the operator's problem, and recording it
 * would put a banner on every account.
 */
async function recordDeliveryOutcome(userId: string, result: DeliveryResult): Promise<void> {
  if (!result.ok && result.reason === "NOT_CONFIGURED") return;

  const data = result.ok
    ? { notificationFailedAt: null, notificationFailureReason: null }
    : { notificationFailedAt: new Date(), notificationFailureReason: result.reason };

  await prisma.user.update({ where: { id: userId }, data }).catch(() => {});
}

/** The account's Riot ID, for the DM footer. */
function accountLabel(account: { riotGameName: string | null; riotTagLine: string | null } | null): string | null {
  return account?.riotGameName ? `${account.riotGameName}#${account.riotTagLine ?? "?"}` : null;
}

async function getDiscordUserId(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "discord" },
    select: { providerAccountId: true },
  });
  return account?.providerAccountId ?? null;
}

/**
 * Checks skins just seen in one linked account's shop against the user's
 * wishlist and DMs them once per skin per cycle, batched into a single
 * message rather than one per skin (Discord's own guidance is not to open a
 * lot of DMs quickly, and it reads better besides). Called after a shop
 * check's own data (sighting stats, account status) is already safely
 * persisted.
 *
 * Dedupe is per linked account, not per user: with several accounts linked,
 * the same wishlisted skin appearing in two different shops is two things
 * worth knowing, not a repeat.
 */
export async function notifyWishlistMatches(
  linkedAccountId: string,
  userId: string,
  skinIds: string[],
): Promise<void> {
  if (skinIds.length === 0) return;

  // Checked before the wishlist read, so a muted user costs one cheap query
  // rather than three.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { wishlistNotificationsEnabled: true },
  });
  if (!user?.wishlistNotificationsEnabled) return;

  const matches = await prisma.wishlistItem.findMany({
    where: { userId, skinId: { in: skinIds } },
    include: { skin: { select: { id: true, displayName: true, displayIconUrl: true, priceVp: true } } },
  });
  if (matches.length === 0) return;

  const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
  const alreadySent = await prisma.notificationSent.findMany({
    where: {
      userId,
      channel: NotificationChannel.DISCORD_DM,
      skinId: { in: matches.map((m) => m.skinId) },
      linkedRiotAccountId: linkedAccountId,
      sentAt: { gte: since },
    },
    select: { skinId: true },
  });
  const alreadySentIds = new Set(alreadySent.map((n) => n.skinId));
  const toNotify = matches.filter((m) => !alreadySentIds.has(m.skinId));
  if (toNotify.length === 0) return;

  const discordUserId = await getDiscordUserId(userId);
  if (!discordUserId) return; // shouldn't happen (sign-in is Discord-only) but never assume

  const account = await prisma.linkedRiotAccount.findUnique({
    where: { id: linkedAccountId },
    select: { riotGameName: true, riotTagLine: true },
  });

  const payload = buildWishlistMatchMessage({
    skins: toNotify.map((m) => m.skin),
    accountLabel: accountLabel(account),
    appUrl: APP_URL,
  });

  const result = await sendDirectMessage(discordUserId, payload);
  await recordDeliveryOutcome(userId, result);
  if (!result.ok) return; // don't record dedup rows for a message that never actually sent

  await prisma.notificationSent
    .createMany({
      data: toNotify.map((m) => ({
        userId,
        skinId: m.skinId,
        channel: NotificationChannel.DISCORD_DM,
        linkedRiotAccountId: linkedAccountId,
      })),
    })
    .catch(() => {});
}

/**
 * Warns a user their Riot link has expired, once per expiry episode -
 * `expiryNotifiedAt` (cleared on every successful (re)link, see
 * linkRiotAccount in src/store-check/) guards against re-notifying on every
 * subsequent failed poll or repeated "check shop now" click.
 *
 * This fires reactively, the moment a refresh actually fails, rather than
 * pre-emptively warning "about to expire" - Riot's rotating OAuth refresh
 * token has no documented fixed TTL the way the old session cookie did, so
 * there's no reliable signal to predict expiry ahead of time. If Riot ever
 * exposes one, this is where a pre-emptive warning would hook in.
 */
export async function notifyRiotLinkExpired(linkedAccountId: string): Promise<void> {
  const account = await prisma.linkedRiotAccount.findUnique({
    where: { id: linkedAccountId },
    select: { userId: true, expiryNotifiedAt: true, riotGameName: true, riotTagLine: true },
  });
  if (!account || account.expiryNotifiedAt) return;

  const discordUserId = await getDiscordUserId(account.userId);
  if (!discordUserId) return;

  const payload = buildLinkExpiredMessage({ accountLabel: accountLabel(account), appUrl: APP_URL });

  const result = await sendDirectMessage(discordUserId, payload);
  await recordDeliveryOutcome(account.userId, result);
  if (!result.ok) return;

  await prisma.linkedRiotAccount
    .update({ where: { id: linkedAccountId }, data: { expiryNotifiedAt: new Date() } })
    .catch(() => {});
}

/**
 * Drops dedupe rows old enough that no send decision can still consult them.
 * The table otherwise grows one row per user per skin per notification
 * forever, while the dedupe read only ever looks at DEDUPE_WINDOW_MS.
 *
 * Doubling the window is the margin that keeps this from ever racing a live
 * dedupe read. There is deliberately no blast-radius guard of the kind
 * expireStaleLinks uses: that one protects stored Riot credentials, which are
 * destroyed permanently. These rows are bookkeeping, and the worst case from
 * over-deleting is one duplicate DM.
 */
export async function pruneNotificationHistory(): Promise<number> {
  const cutoff = new Date(Date.now() - 2 * DEDUPE_WINDOW_MS);
  const { count } = await prisma.notificationSent.deleteMany({ where: { sentAt: { lt: cutoff } } });
  return count;
}
