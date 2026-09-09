// Renders and optionally delivers one notification DM, so the delivery path
// can be confirmed end to end without waiting for a real shop rotation.
//
// This is a probe, not a notification. It deliberately writes nothing: no
// notifications_sent rows, no notificationFailedAt, and it never consults
// wishlistNotificationsEnabled. Wiring any of those in would make a test run
// suppress or fake a real notification.
//
// Usage:
//   npm run test-notification -- --discord-id <id>
//   npm run test-notification -- --discord-id <id> --kind expired --send
//
// Without --send it is a dry run: the payload is printed and nothing leaves
// this machine.
import { prisma } from "@/lib/db";
import { sendDirectMessage } from "@/discord/bot";
import {
  buildWishlistMatchMessage,
  buildLinkExpiredMessage,
  deliveryFailureExplanation,
  type WishlistMatchSkin,
} from "@/notifications/messages";
import { siteUrl } from "@/lib/siteUrl";

const DISCORD_API = "https://discord.com/api/v10";
const SKINS_IN_A_SHOP = 4;

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function option(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

function line(ok: boolean, label: string, detail: string): boolean {
  console.log(`  ${ok ? "ok    " : "FAILED"} ${label.padEnd(28)} ${detail}`);
  return ok;
}

/**
 * Everything that has to be true for a DM to arrive, checked in the order the
 * delivery path needs it. Values are reported as configured/not configured -
 * a bot token, and the guild id that identifies a private server, are both
 * things this must never echo.
 */
async function preflight(discordUserId: string): Promise<boolean> {
  console.log("\nPreflight");

  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token) return line(false, "DISCORD_BOT_TOKEN", "not configured");
  line(true, "DISCORD_BOT_TOKEN", "configured");
  if (!guildId) return line(false, "DISCORD_GUILD_ID", "not configured");
  line(true, "DISCORD_GUILD_ID", "configured");

  const auth = { Authorization: `Bot ${token}` };

  const me = await fetch(`${DISCORD_API}/users/@me`, { headers: auth, signal: AbortSignal.timeout(10_000) });
  if (!me.ok) return line(false, "bot token accepted", `Discord returned HTTP ${me.status}`);
  line(true, "bot token accepted", "Discord recognises this bot");

  const guild = await fetch(`${DISCORD_API}/guilds/${guildId}`, { headers: auth, signal: AbortSignal.timeout(10_000) });
  if (!guild.ok) {
    return line(false, "bot sees the server", `HTTP ${guild.status} - the bot may have been removed, or the id is wrong`);
  }
  line(true, "bot sees the server", "bot is a member");

  // The check that predicts a 50007 before it happens. A bot cannot DM a user
  // it shares no server with, so a 404 here means the guilds.join step never
  // ran for this account - re-signing in with Discord is the fix.
  const member = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordUserId}`, {
    headers: auth,
    signal: AbortSignal.timeout(10_000),
  });
  if (!member.ok) {
    return line(
      false,
      "recipient is a member",
      member.status === 404
        ? "not in the server - sign out and back in with Discord to trigger the guild join"
        : `HTTP ${member.status}`,
    );
  }
  return line(true, "recipient is a member", "the bot shares a server with them");
}

/**
 * Real catalog rows rather than fixtures, so the rendered embed exercises
 * real names and real CDN thumbnail URLs - the parts a fixture cannot get
 * wrong and Discord can still reject.
 */
async function sampleShopSkins(): Promise<WishlistMatchSkin[]> {
  const eligible = { displayIconUrl: { not: null } };
  const total = await prisma.skin.count({ where: eligible });
  const skip = total > SKINS_IN_A_SHOP ? Math.floor(Math.random() * (total - SKINS_IN_A_SHOP)) : 0;

  return prisma.skin.findMany({
    where: eligible,
    orderBy: { id: "asc" },
    skip,
    take: SKINS_IN_A_SHOP,
    select: { id: true, displayName: true, displayIconUrl: true, priceVp: true },
  });
}

async function main() {
  const discordUserId = option("discord-id");
  const kind = option("kind") ?? "wishlist";
  const send = flag("send");

  if (!discordUserId) {
    console.error("Usage: npm run test-notification -- --discord-id <id> [--kind wishlist|expired] [--send]");
    process.exitCode = 1;
    return;
  }
  if (kind !== "wishlist" && kind !== "expired") {
    console.error(`Unknown --kind "${kind}". Expected "wishlist" or "expired".`);
    process.exitCode = 1;
    return;
  }

  // A failed preflight blocks sending, not rendering - inspecting the payload
  // is useful long before a bot exists to deliver it.
  const canSend = await preflight(discordUserId);

  const appUrl = siteUrl();
  const payload =
    kind === "wishlist"
      ? buildWishlistMatchMessage({
          skins: await sampleShopSkins(),
          // Obviously synthetic: a probe should never look like it came from
          // a real linked account.
          accountLabel: "Example#0000",
          appUrl,
        })
      : buildLinkExpiredMessage({ accountLabel: "Example#0000", appUrl });

  console.log(`\nPayload (${kind})`);
  console.log(JSON.stringify(payload, null, 2));

  if (!send) {
    console.log("\nDry run - pass --send to deliver it.");
    process.exitCode = canSend ? 0 : 1;
    return;
  }
  if (!canSend) {
    console.log("\nPreflight failed - not sending.");
    process.exitCode = 1;
    return;
  }

  const result = await sendDirectMessage(discordUserId, payload);
  if (result.ok) {
    console.log("\nDelivered.");
    return;
  }

  console.log(`\nNot delivered: ${result.reason}`);
  if (result.reason !== "NOT_CONFIGURED") console.log(deliveryFailureExplanation(result.reason));
  process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("test-notification failed:", err instanceof Error ? err.name : "unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
