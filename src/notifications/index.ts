import { prisma } from "@/lib/db";
import { NotificationChannel } from "@/generated/prisma/client";
import { sendDirectMessage } from "@/discord/bot";
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

async function getDiscordUserId(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "discord" },
    select: { providerAccountId: true },
  });
  return account?.providerAccountId ?? null;
}

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Checks skins just seen in a user's shop against their wishlist and DMs
 * them once per skin per cycle, batched into a single message rather than
 * one per skin (Discord's own guidance is not to open a lot of DMs quickly,
 * and it reads better besides). Called after a shop check's own data
 * (sighting stats, account status) is already safely persisted.
 */
export async function notifyWishlistMatches(userId: string, skinIds: string[]): Promise<void> {
  if (skinIds.length === 0) return;

  const matches = await prisma.wishlistItem.findMany({
    where: { userId, skinId: { in: skinIds } },
    include: { skin: { select: { id: true, displayName: true } } },
  });
  if (matches.length === 0) return;

  const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
  const alreadySent = await prisma.notificationSent.findMany({
    where: {
      userId,
      channel: NotificationChannel.DISCORD_DM,
      skinId: { in: matches.map((m) => m.skinId) },
      sentAt: { gte: since },
    },
    select: { skinId: true },
  });
  const alreadySentIds = new Set(alreadySent.map((n) => n.skinId));
  const toNotify = matches.filter((m) => !alreadySentIds.has(m.skinId));
  if (toNotify.length === 0) return;

  const discordUserId = await getDiscordUserId(userId);
  if (!discordUserId) return; // shouldn't happen (sign-in is Discord-only) but never assume

  const list = joinNames(toNotify.map((m) => m.skin.displayName));
  const content = `🎯 **${list}** just showed up in your daily shop - it's on your wishlist. ${APP_URL}/account`;

  const delivered = await sendDirectMessage(discordUserId, content);
  if (!delivered) return; // don't record dedup rows for a message that never actually sent

  await prisma.notificationSent
    .createMany({ data: toNotify.map((m) => ({ userId, skinId: m.skinId, channel: NotificationChannel.DISCORD_DM })) })
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

  const who = account.riotGameName ? `${account.riotGameName}#${account.riotTagLine ?? "?"}` : "Your Riot account";
  const content = `⚠️ ${who}'s login expired, so Valoadout can't check your shop anymore. Re-link it to keep wishlist notifications going: ${APP_URL}/account`;

  const delivered = await sendDirectMessage(discordUserId, content);
  if (!delivered) return;

  await prisma.linkedRiotAccount
    .update({ where: { id: linkedAccountId }, data: { expiryNotifiedAt: new Date() } })
    .catch(() => {});
}
