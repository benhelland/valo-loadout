// Verifies that every configured credential still works, by actually using it.
//
// Nothing in this app's environment expires on a timer - Neon connection
// strings, AUTH_SECRET, CRON_SECRET, the encryption key and the Discord
// credentials all last until something revokes or resets them. So there is no
// date to warn about; the only honest signal is "does this still work right
// now", which needs a live probe.
//
// Never prints a secret value. Results are OK / MISSING / BROKEN plus the
// action to take, and any upstream error is reduced to a status code.
//
// Usage:
//   npm run check-env                                   (dev, via .env.local)
//   ( set -a; . ./.env.production.local; set +a; npx tsx src/scripts/checkEnv.ts )
//
// Exits non-zero if anything required is missing or broken, so it can gate a
// deploy or run on a schedule.
import { prisma } from "@/lib/db";
import { parseKey, encryptSecret, decryptSecret } from "@/lib/crypto";

type State = "OK" | "MISSING" | "BROKEN" | "SKIPPED";

interface Result {
  name: string;
  state: State;
  detail: string;
  /** Optional credentials do not fail the run. */
  optional?: boolean;
}

const results: Result[] = [];
const add = (r: Result) => results.push(r);

function present(name: string): string | null {
  const v = process.env[name];
  return v && v.length > 0 ? v : null;
}

async function checkDatabase() {
  if (!present("DATABASE_URL")) {
    add({ name: "DATABASE_URL", state: "MISSING", detail: "the app cannot start without it" });
    return;
  }
  try {
    const [skins, marker] = await Promise.all([prisma.skin.count(), prisma.environmentMarker.findFirst()]);
    add({ name: "DATABASE_URL", state: "OK", detail: `connected; ${skins} skins; marker="${marker?.name ?? "none"}"` });
  } catch (err) {
    // err.name, never err.message. A driver's connection error routinely
    // embeds the connection string, and this output gets pasted into issues
    // and chat. Widening this to err.message would leak DATABASE_URL - it
    // looks like a harmless improvement to error reporting and is not.
    const kind = err instanceof Error ? err.name : "unknown";
    add({ name: "DATABASE_URL", state: "BROKEN", detail: `connection failed (${kind}) - check the Neon project and that the role still exists` });
  }
}

function checkEncryptionKey() {
  const raw = present("RIOT_TOKEN_ENCRYPTION_KEY");
  if (!raw) {
    add({ name: "RIOT_TOKEN_ENCRYPTION_KEY", state: "MISSING", detail: "linked Riot accounts cannot be decrypted" });
    return;
  }
  try {
    const key = parseKey(raw);
    const probe = "valoadout-health-probe";
    if (decryptSecret(encryptSecret(probe, key), key) !== probe) throw new Error("round-trip mismatch");
    add({ name: "RIOT_TOKEN_ENCRYPTION_KEY", state: "OK", detail: "valid 32-byte key, round-trips" });
  } catch (err) {
    add({ name: "RIOT_TOKEN_ENCRYPTION_KEY", state: "BROKEN", detail: err instanceof Error ? err.message : "unusable" });
  }
}

// A key can be valid yet no longer match what is stored - exactly what a
// half-finished rotation leaves behind, and invisible until a poll runs.
async function checkStoredTokensDecrypt() {
  try {
    const linked = await prisma.linkedRiotAccount.findMany({ select: { encryptedRefreshToken: true }, take: 25 });
    if (linked.length === 0) {
      add({ name: "stored Riot tokens", state: "SKIPPED", detail: "no linked accounts", optional: true });
      return;
    }
    let bad = 0;
    for (const a of linked) {
      try {
        decryptSecret(a.encryptedRefreshToken);
      } catch {
        bad++;
      }
    }
    add({
      name: "stored Riot tokens",
      state: bad === 0 ? "OK" : "BROKEN",
      detail: bad === 0
        ? `all ${linked.length} decrypt under the current key`
        : `${bad}/${linked.length} fail to decrypt - key and database disagree; see rotateEncryptionKey.ts`,
    });
  } catch {
    add({ name: "stored Riot tokens", state: "SKIPPED", detail: "database unavailable", optional: true });
  }
}

async function checkDiscordOAuth() {
  const id = present("AUTH_DISCORD_ID");
  const secret = present("AUTH_DISCORD_SECRET");
  if (!id || !secret) {
    add({ name: "AUTH_DISCORD_ID / SECRET", state: "MISSING", detail: "sign-in is impossible without both" });
    return;
  }
  try {
    // A client-credentials grant validates the pair without involving a user.
    const basic = Buffer.from(`${id}:${secret}`).toString("base64");
    const res = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: "identify" }),
      signal: AbortSignal.timeout(10_000),
    });
    add({
      name: "AUTH_DISCORD_ID / SECRET",
      state: res.ok ? "OK" : "BROKEN",
      detail: res.ok
        ? "Discord accepted the client credentials"
        : `Discord rejected them (HTTP ${res.status}) - the secret may have been reset in the Developer Portal`,
    });
  } catch {
    add({ name: "AUTH_DISCORD_ID / SECRET", state: "BROKEN", detail: "could not reach Discord" });
  }
}

async function checkBotToken() {
  const token = present("DISCORD_BOT_TOKEN");
  const guild = present("DISCORD_GUILD_ID");
  if (!token || !guild) {
    add({ name: "DISCORD_BOT_TOKEN / GUILD_ID", state: "SKIPPED", detail: "not configured - notifications no-op by design", optional: true });
    return;
  }
  try {
    const me = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!me.ok) {
      add({ name: "DISCORD_BOT_TOKEN", state: "BROKEN", detail: `token rejected (HTTP ${me.status}) - Discord invalidates a bot token that leaks publicly` });
      return;
    }
    add({ name: "DISCORD_BOT_TOKEN", state: "OK", detail: "token accepted" });

    const g = await fetch(`https://discord.com/api/v10/guilds/${guild}`, {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    add({
      name: "DISCORD_GUILD_ID",
      state: g.ok ? "OK" : "BROKEN",
      detail: g.ok
        ? "bot is a member of the configured server"
        : `bot cannot see that server (HTTP ${g.status}) - it may have been removed, or the id is wrong`,
    });
  } catch {
    add({ name: "DISCORD_BOT_TOKEN / GUILD_ID", state: "BROKEN", detail: "could not reach Discord" });
  }
}

function checkPlainRequired() {
  const required: [string, string][] = [
    ["AUTH_SECRET", "sessions cannot be signed"],
    ["CRON_SECRET", "the cron route fails closed with a 503"],
  ];
  for (const [name, why] of required) {
    add(present(name) ? { name, state: "OK", detail: "set" } : { name, state: "MISSING", detail: why });
  }

  const appUrl = present("NEXT_PUBLIC_APP_URL");
  if (!appUrl) {
    add({ name: "NEXT_PUBLIC_APP_URL", state: "SKIPPED", detail: "falls back to VERCEL_URL/localhost", optional: true });
    return;
  }
  try {
    new URL(appUrl);
    add({ name: "NEXT_PUBLIC_APP_URL", state: "OK", detail: appUrl });
  } catch {
    add({ name: "NEXT_PUBLIC_APP_URL", state: "BROKEN", detail: "not a valid URL" });
  }
}

async function main() {
  checkEncryptionKey();
  checkPlainRequired();
  await checkDatabase();
  await checkStoredTokensDecrypt();
  await checkDiscordOAuth();
  await checkBotToken();

  const label: Record<State, string> = { OK: "  ok     ", MISSING: "  MISSING", BROKEN: "  BROKEN ", SKIPPED: "  --     " };
  console.log("");
  for (const r of results) console.log(`${label[r.state]} ${r.name.padEnd(30)} ${r.detail}`);

  const failures = results.filter((r) => (r.state === "MISSING" || r.state === "BROKEN") && !r.optional);
  console.log("");
  console.log(failures.length === 0 ? "All configured credentials work." : `${failures.length} problem(s) need attention.`);

  // Set the code BEFORE disconnecting, and use exitCode rather than
  // process.exit(). Two separate hazards:
  //   - process.exit() straight after $disconnect() aborts the driver's
  //     socket teardown mid-flight and trips a libuv assertion on Windows.
  //   - the process can exit during $disconnect() without resuming this
  //     function, so anything set after that await may never run - which
  //     silently reported failures while still exiting 0.
  process.exitCode = failures.length === 0 ? 0 : 1;
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("check-env failed:", err instanceof Error ? err.name : "unknown error");
  process.exitCode = 1;
  await prisma.$disconnect();
});
