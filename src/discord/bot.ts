// A thin client for the Discord Bot API used to deliver automatic
// notifications - see docs/ARCHITECTURE.md "Notifications". Zero database
// imports, mirroring src/riot/'s isolation: src/notifications/ is the only
// seam that connects this to Prisma.
//
// Two calls, both idempotent, both best-effort:
//   - joinGuild: adds a signed-in user to this app's own Discord server, so
//     the bot has somewhere to share a mutual guild with them. This is the
//     whole reason this module exists instead of just DMing by user id - a
//     bot cannot open a DM with a user it shares no server with (confirmed
//     against Discord's own docs before building this), so "automatic,
//     zero-setup" notifications require putting the user in a shared guild
//     first, done silently as part of the Discord sign-in they already do.
//   - sendDirectMessage: opens/reuses a DM channel and posts into it.
//
// Neither function ever throws. A Discord outage, an unconfigured bot token,
// or a user who left the server must never break sign-in or a shop check -
// callers get a boolean (or nothing) and decide what, if anything, to do
// about a failure.

const API_BASE = "https://discord.com/api/v10";

function getBotToken(): string | null {
  const token = process.env.DISCORD_BOT_TOKEN;
  return token && token.length > 0 ? token : null;
}

function getGuildId(): string | null {
  const id = process.env.DISCORD_GUILD_ID;
  return id && id.length > 0 ? id : null;
}

/**
 * Whether a notification can actually be delivered. Both values are required:
 * the bot token to call Discord at all, and the guild id because a bot cannot
 * DM a user it shares no server with.
 *
 * Exported so the UI can avoid offering a feature that cannot work. Linking a
 * Riot account exists to enable shop notifications, and it costs the user a
 * real stored credential to do - so with delivery unconfigured, offering it
 * would collect that credential in exchange for nothing. `/account` uses this
 * to hide the linking flow until delivery is possible, and it re-enables
 * itself as soon as both env vars are set, with no code change.
 */
export function isNotificationDeliveryConfigured(): boolean {
  return getBotToken() !== null && getGuildId() !== null;
}

/**
 * Adds a user to this app's Discord server using the access token from their
 * most recent Discord sign-in (must carry the `guilds.join` scope - see
 * src/auth.ts). Safe to call on every sign-in: Discord returns 204 if
 * they're already a member, which doubles as self-healing for a user who
 * left the server (their next sign-in re-adds them, no support request
 * needed).
 */
export async function joinGuild(discordUserId: string, userAccessToken: string): Promise<void> {
  const botToken = getBotToken();
  const guildId = getGuildId();
  if (!botToken || !guildId) {
    // Not configured - notifications are simply off for now. Never block
    // sign-in on this.
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/guilds/${guildId}/members/${discordUserId}`, {
      method: "PUT",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: userAccessToken }),
    });
    // 201 = newly added, 204 = already a member. Anything else is worth a
    // log line (e.g. the bot lacks CREATE_INSTANT_INVITE in the guild) but
    // still shouldn't be surfaced to the signing-in user.
    if (!response.ok && response.status !== 204) {
      console.error(`[discord] failed to add user to guild: ${response.status}`);
    }
  } catch (err) {
    console.error("[discord] joinGuild request failed", err);
  }
}

/**
 * Sends a DM. Returns whether it was actually delivered - false (never a
 * throw) if the bot isn't configured, shares no guild with the user, or
 * Discord otherwise rejects the message (e.g. the user has DMs from server
 * members disabled).
 */
export async function sendDirectMessage(discordUserId: string, content: string): Promise<boolean> {
  const botToken = getBotToken();
  if (!botToken) return false;

  try {
    const channelResponse = await fetch(`${API_BASE}/users/@me/channels`, {
      method: "POST",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: discordUserId }),
    });
    if (!channelResponse.ok) {
      console.error(`[discord] failed to open DM channel: ${channelResponse.status}`);
      return false;
    }
    const channel = (await channelResponse.json()) as { id: string };

    const messageResponse = await fetch(`${API_BASE}/channels/${channel.id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!messageResponse.ok) {
      // 403 (Discord error code 50007, "Cannot send messages to this user")
      // is the expected shape when the user left the guild or disabled DMs -
      // an undelivered message, not an application error.
      console.error(`[discord] failed to send DM: ${messageResponse.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[discord] sendDirectMessage request failed", err);
    return false;
  }
}
