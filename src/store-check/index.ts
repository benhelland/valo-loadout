import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { createSessionFromSsid } from "@/riot/auth";
import { fetchDailyShop } from "@/riot/store";
import { RiotError, isRiotError } from "@/riot/errors";
import { assertUsableSsid } from "@/riot/ssid";
import { LinkedAccountStatus } from "@/generated/prisma/client";

// The seam between the isolated Riot client (src/riot/, no database access)
// and this app's data. Everything that persists anything Riot-derived lives
// here, so "turn the store-check subsystem off" means not calling into this
// file - the gallery, loadouts and sharing never import it.

export interface LinkResult {
  linkedAccountId: string;
  gameName: string | null;
  tagLine: string | null;
  region: string;
}

/**
 * Validates a pasted `ssid` by actually using it, then stores it encrypted.
 * The cookie is proven to work before anything is written, so a bad paste
 * fails immediately with a clear reason instead of creating a dead row that
 * only errors on the next scheduled poll.
 */
export async function linkRiotAccount(userId: string, rawSsid: string): Promise<LinkResult> {
  const ssid = rawSsid.trim();
  assertUsableSsid(ssid);

  const session = await createSessionFromSsid(ssid);

  // Riot may hand back a rolled cookie during that exchange; storing the
  // newest one is what keeps a link alive longest.
  const toStore = session.refreshedSsid ?? ssid;

  const linked = await prisma.linkedRiotAccount.upsert({
    where: { userId_puuid: { userId, puuid: session.puuid } },
    create: {
      userId,
      puuid: session.puuid,
      encryptedSessionToken: encryptSecret(toStore),
      region: session.region,
      riotGameName: session.gameName,
      riotTagLine: session.tagLine,
      status: LinkedAccountStatus.ACTIVE,
      lastError: null,
      // Check almost immediately so the user sees their shop right after
      // linking rather than waiting for tomorrow's rotation.
      nextPollAt: new Date(),
    },
    update: {
      encryptedSessionToken: encryptSecret(toStore),
      region: session.region,
      riotGameName: session.gameName,
      riotTagLine: session.tagLine,
      status: LinkedAccountStatus.ACTIVE,
      lastError: null,
      nextPollAt: new Date(),
    },
  });

  return {
    linkedAccountId: linked.id,
    gameName: session.gameName,
    tagLine: session.tagLine,
    region: session.region,
  };
}

export interface ShopCheckResult {
  /** Skin ids resolved from the rotation, in offer order. */
  skinIds: string[];
  /** Offer ids we couldn't resolve - almost always a skin not yet synced. */
  unresolvedOfferIds: string[];
  nextPollAt: Date;
}

/**
 * One poll for one linked account: refresh the session, read the rotation,
 * record what was seen. Never throws for expected failure modes - it records
 * the status on the account and rethrows only so the caller can log/count.
 */
export async function runShopCheck(linkedAccountId: string): Promise<ShopCheckResult> {
  const account = await prisma.linkedRiotAccount.findUnique({ where: { id: linkedAccountId } });
  if (!account) throw new RiotError("UNEXPECTED", "Linked account not found");

  try {
    const ssid = decryptSecret(account.encryptedSessionToken);
    const session = await createSessionFromSsid(ssid);
    const shop = await fetchDailyShop(session);

    // Offers are skin *level* ids; the gallery is keyed by skin. Levels we
    // don't have are skipped rather than failing the check - a brand-new skin
    // just means the catalog sync hasn't run since it shipped.
    const levels = await prisma.skinLevel.findMany({
      where: { id: { in: shop.offerIds } },
      select: { id: true, skinId: true },
    });
    const skinIdByLevel = new Map(levels.map((level) => [level.id, level.skinId]));

    const skinIds: string[] = [];
    const unresolvedOfferIds: string[] = [];
    for (const offerId of shop.offerIds) {
      const skinId = skinIdByLevel.get(offerId);
      if (skinId) skinIds.push(skinId);
      else unresolvedOfferIds.push(offerId);
    }

    // Poll shortly after the rotation actually flips, jittered so many
    // accounts don't all hit Riot at the same instant (docs/ARCHITECTURE.md).
    const jitterMs = Math.floor(Math.random() * 30 * 60 * 1000);
    const nextPollAt = new Date(Date.now() + shop.resetInSeconds * 1000 + 60_000 + jitterMs);

    await prisma.$transaction([
      // Upsert one row per (account, skin) ever seen - bounded by catalog
      // size, not time. Powers "last seen N days ago" / "seen N times".
      ...skinIds.map((skinId) =>
        prisma.skinSightingStat.upsert({
          where: { linkedRiotAccountId_skinId: { linkedRiotAccountId: account.id, skinId } },
          create: { linkedRiotAccountId: account.id, skinId },
          update: { lastSeenAt: new Date(), timesSeen: { increment: 1 } },
        }),
      ),
      prisma.linkedRiotAccount.update({
        where: { id: account.id },
        data: {
          status: LinkedAccountStatus.ACTIVE,
          lastError: null,
          lastSyncedAt: new Date(),
          nextPollAt,
          // Roll the cookie forward if Riot issued a new one.
          ...(session.refreshedSsid ? { encryptedSessionToken: encryptSecret(session.refreshedSsid) } : {}),
        },
      }),
    ]);

    return { skinIds, unresolvedOfferIds, nextPollAt };
  } catch (err) {
    await recordFailure(account.id, err);
    throw err;
  }
}

export interface DueCheckSummary {
  attempted: number;
  succeeded: number;
  failed: number;
}

/**
 * Polls every account whose `nextPollAt` has passed. This is the whole body of
 * the scheduled job - the trigger (Vercel Cron route vs. a script run
 * anywhere) is deliberately not this module's concern, because whether a
 * datacenter IP can even reach Riot is an open question (see the Cloudflare
 * note in docs/ARCHITECTURE.md).
 *
 * EXPIRED and CAPTCHA_BLOCKED accounts are excluded, not merely deprioritised:
 * both need the user to act, and re-polling them is precisely the retry-loop
 * docs/RISKS.md warns against.
 */
export async function runDueShopChecks(limit = 25): Promise<DueCheckSummary> {
  const due = await prisma.linkedRiotAccount.findMany({
    where: {
      nextPollAt: { not: null, lte: new Date() },
      status: { in: [LinkedAccountStatus.ACTIVE, LinkedAccountStatus.ERROR] },
    },
    orderBy: { nextPollAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let succeeded = 0;
  let failed = 0;

  // Sequential on purpose. The HTTP layer throttles anyway, but running these
  // one at a time keeps the outbound pattern boring and predictable, which is
  // the behaviour RISKS.md actually cares about.
  for (const account of due) {
    try {
      await runShopCheck(account.id);
      succeeded++;
    } catch {
      // runShopCheck has already recorded the reason on the account row.
      // Swallowed here so one bad account can't abort the whole batch.
      failed++;
    }
  }

  return { attempted: due.length, succeeded, failed };
}

async function recordFailure(linkedAccountId: string, err: unknown): Promise<void> {
  const riotError = isRiotError(err) ? err : null;

  // Only ever persist our own message text. An arbitrary thrown error could
  // carry a request body or header in its message, and CLAUDE.md forbids
  // tokens reaching logs or error reporting.
  const message = riotError?.message ?? "An unexpected problem occurred while checking your shop.";
  const status = riotError?.accountStatus ?? LinkedAccountStatus.ERROR;

  // A retryable blip shouldn't push the account to tomorrow - try again in an
  // hour. A non-retryable one (expired session, hard block) waits for the
  // user to act, so it gets no next poll at all rather than a retry loop.
  const nextPollAt = riotError?.isRetryable ? new Date(Date.now() + 60 * 60 * 1000) : null;

  await prisma.linkedRiotAccount.update({
    where: { id: linkedAccountId },
    data: { status, lastError: message, nextPollAt },
  });
}
