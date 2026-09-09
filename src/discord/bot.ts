// A thin client for the Discord Bot API used to deliver automatic
// notifications - see docs/ARCHITECTURE.md "Notifications". Zero database
// imports, mirroring src/riot/'s isolation: src/notifications/ is the only
// seam that connects this to Prisma.
//
// Two calls, both idempotent, both best-effort:
//   - joinGuild: adds a signed-in user to this app's own Discord server, so
//     the bot has somewhere to share a mutual guild with them. This is the
//     whole reason this module exists instead of just DMing by user id - a
//     bot cannot open a DM with a user it shares no server with, so
//     "automatic, zero-setup" notifications require putting the user in a
//     shared guild first, done silently as part of the Discord sign-in they
//     already do.
//   - sendDirectMessage: opens/reuses a DM channel and posts into it.
//
// Neither function ever throws. A Discord outage, an unconfigured bot token,
// or a user who left the server must never break sign-in or a shop check -
// callers get a result they can act on and decide what, if anything, to do
// about a failure.

const API_BASE = "https://discord.com/api/v10";

// --- Rate limiting -------------------------------------------------------
//
// Same two guards as src/riot/http.ts, for the same reasons: MIN_INTERVAL_MS
// serialises outbound calls so a burst can never leave here faster than one
// per interval, and MAX_CALLS_PER_PROCESS is a circuit breaker for a runaway
// loop. Opening a DM channel is one of Discord's more aggressively limited
// routes and a shop-check batch opens one per notified user back to back, so
// the interval is wider than Riot's.
const MIN_INTERVAL_MS = 300;
const MAX_CALLS_PER_PROCESS = 500;
const REQUEST_TIMEOUT_MS = 15_000;

// A 429 is retried once, and only when Discord's own `retry_after` is under
// this. Beyond it, waiting parks a whole cron run for a message that is
// disposable - the next shop check will try again.
const MAX_RETRY_AFTER_MS = 5_000;

// "Cannot send messages to this user": DMs from server members are off, or
// the user is no longer in the guild.
const DMS_CLOSED_CODE = 50007;

let callCount = 0;
let queueTail: Promise<void> = Promise.resolve();
let lastCallAt = 0;

function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => {
    const waitFor = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (waitFor > 0) await new Promise((resolve) => setTimeout(resolve, waitFor));
    lastCallAt = Date.now();
  });
  // Keep the chain alive even if a call rejects, or one failure would wedge
  // the queue for every later caller.
  queueTail = run.catch(() => {});
  return run.then(fn);
}

function reserveCall(): boolean {
  if (callCount >= MAX_CALLS_PER_PROCESS) return false;
  callCount++;
  return true;
}

function getBotToken(): string | null {
  const token = process.env.DISCORD_BOT_TOKEN;
  return token && token.length > 0 ? token : null;
}

function getGuildId(): string | null {
  const id = process.env.DISCORD_GUILD_ID;
  return id && id.length > 0 ? id : null;
}

/** Body field of a JSON response, or null if the body isn't readable. */
async function readNumberField(response: Response, field: string): Promise<number | null> {
  try {
    // Cloned so the caller can still read the body off the original.
    const body = (await response.clone().json()) as Record<string, unknown>;
    const value = body[field];
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

/**
 * The only place this app calls Discord, so the throttle, budget and 429
 * handling cannot be skipped by a new call site. Returns null when no
 * response was obtained at all (network error, timeout, budget exhausted);
 * an HTTP error is returned as its Response for the caller to classify.
 */
async function discordFetch(
  botToken: string,
  path: string,
  init: { method: string; body?: unknown },
): Promise<Response | null> {
  if (!reserveCall()) {
    console.error("[discord] outbound request budget exhausted - not calling Discord again this run");
    return null;
  }

  return throttle(async () => {
    const send = () =>
      fetch(`${API_BASE}${path}`, {
        method: init.method,
        headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

    try {
      const response = await send();
      if (response.status !== 429) return response;

      const retryAfterSeconds = await readNumberField(response, "retry_after");
      const retryAfterMs = retryAfterSeconds === null ? null : retryAfterSeconds * 1000;
      if (retryAfterMs === null || retryAfterMs > MAX_RETRY_AFTER_MS || !reserveCall()) return response;

      await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
      return await send();
    } catch (err) {
      // The message is ours, not the underlying error's, so a request header
      // cannot travel into a log line.
      const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "network error";
      console.error(`[discord] request failed (${reason})`);
      return null;
    }
  });
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

export type DeliveryFailureReason =
  | "NOT_CONFIGURED"
  | "DMS_CLOSED"
  | "RATE_LIMITED"
  | "UNKNOWN";

export type DeliveryResult = { ok: true } | { ok: false; reason: DeliveryFailureReason };

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
  if (!botToken || !guildId) return;

  const response = await discordFetch(botToken, `/guilds/${guildId}/members/${discordUserId}`, {
    method: "PUT",
    body: { access_token: userAccessToken },
  });
  // 201 = newly added, 204 = already a member. Anything else is worth a log
  // line (e.g. the bot lacks CREATE_INSTANT_INVITE in the guild) but still
  // shouldn't be surfaced to the signing-in user.
  if (response && !response.ok && response.status !== 204) {
    console.error(`[discord] failed to add user to guild: ${response.status}`);
  }
}

async function classifyFailure(response: Response): Promise<DeliveryFailureReason> {
  if (response.status === 429) return "RATE_LIMITED";
  const code = await readNumberField(response, "code");
  return code === DMS_CLOSED_CODE ? "DMS_CLOSED" : "UNKNOWN";
}

/**
 * Sends a DM. Never throws - an undelivered message is a result, not an
 * error. DMS_CLOSED is separated from the rest because it is the only
 * failure the user themselves can fix.
 */
export async function sendDirectMessage(discordUserId: string, content: string): Promise<DeliveryResult> {
  const botToken = getBotToken();
  if (!botToken) return { ok: false, reason: "NOT_CONFIGURED" };

  const channelResponse = await discordFetch(botToken, "/users/@me/channels", {
    method: "POST",
    body: { recipient_id: discordUserId },
  });
  if (!channelResponse) return { ok: false, reason: "UNKNOWN" };
  if (!channelResponse.ok) {
    console.error(`[discord] failed to open DM channel: ${channelResponse.status}`);
    return { ok: false, reason: await classifyFailure(channelResponse) };
  }

  let channelId: string;
  try {
    channelId = ((await channelResponse.json()) as { id: string }).id;
  } catch {
    console.error("[discord] DM channel response was not readable JSON");
    return { ok: false, reason: "UNKNOWN" };
  }

  const messageResponse = await discordFetch(botToken, `/channels/${channelId}/messages`, {
    method: "POST",
    body: { content },
  });
  if (!messageResponse) return { ok: false, reason: "UNKNOWN" };
  if (!messageResponse.ok) {
    console.error(`[discord] failed to send DM: ${messageResponse.status}`);
    return { ok: false, reason: await classifyFailure(messageResponse) };
  }
  return { ok: true };
}
