import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { createSessionFromCode, createSessionFromRefreshToken, type RiotSession } from "@/riot/auth";
import { extractAuthorizationCode } from "@/riot/oauth";
import { fetchDailyShop } from "@/riot/store";
import { RiotError, isRiotError } from "@/riot/errors";
import { LinkedAccountStatus } from "@/generated/prisma/client";
import { notifyWishlistMatches, notifyRiotLinkExpired } from "@/notifications";
import { LimitExceededError, MAX_LINKED_RIOT_ACCOUNTS_PER_USER } from "@/lib/limits";

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
 * Completes the OAuth link. The code is validated, redeemed, and the
 * resulting refresh token stored encrypted. The code is proven to work before
 * anything is written, so a bad paste fails immediately with a clear reason
 * rather than creating a dead row that only errors on the next poll.
 */
export async function linkRiotAccount(userId: string, pastedRedirect: string): Promise<LinkResult> {
  const code = extractAuthorizationCode(pastedRedirect);
  const session = await createSessionFromCode(code);

  // Only the create half of the upsert is capped. Re-linking an account this
  // user already has (a rotated or expired token) has to keep working even at
  // the cap, or the recovery path would be blocked by the limit.
  const alreadyLinked = await prisma.linkedRiotAccount.findUnique({
    where: { userId_puuid: { userId, puuid: session.puuid } },
    select: { id: true },
  });
  if (!alreadyLinked) {
    const count = await prisma.linkedRiotAccount.count({ where: { userId } });
    if (count >= MAX_LINKED_RIOT_ACCOUNTS_PER_USER) {
      throw new LimitExceededError(
        `You can link up to ${MAX_LINKED_RIOT_ACCOUNTS_PER_USER} Riot accounts. Unlink one first.`,
      );
    }
  }

  const linked = await prisma.linkedRiotAccount.upsert({
    where: { userId_puuid: { userId, puuid: session.puuid } },
    create: {
      userId,
      puuid: session.puuid,
      encryptedRefreshToken: encryptSecret(session.refreshToken),
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
      encryptedRefreshToken: encryptSecret(session.refreshToken),
      region: session.region,
      riotGameName: session.gameName,
      riotTagLine: session.tagLine,
      status: LinkedAccountStatus.ACTIVE,
      lastError: null,
      nextPollAt: new Date(),
      refreshLockedUntil: null,
      // A fresh link resets the expiry-notification guard too, so a future
      // expiry (of this new token) can notify again.
      expiryNotifiedAt: null,
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
  skinIds: string[];
  unresolvedOfferIds: string[];
  nextPollAt: Date;
  /** Skins whose real VP price this check recorded - see recordObservedPrices. */
  pricesRecorded: number;
}

// How long a refresh may hold the lease. Long enough for the OAuth round trip
// plus the three follow-up calls; short enough that a crashed run frees the
// account well before its next daily poll.
const REFRESH_LOCK_MS = 60_000;

/**
 * Takes an exclusive lease on refreshing this account, refreshes, and stores
 * the rotated token.
 *
 * Exported (as `acquireSession`) because more than one job needs an
 * authenticated session - the daily shop check and the price sync.
 * Every such job must go through this, never `createSessionFromRefreshToken`
 * directly: the rotation hazard below is not specific to shop checks, and a
 * second entry point that skipped the lease would reintroduce it.
 *
 * This lock is load-bearing, not defensive padding. Riot rotates the refresh
 * token on every use, so two overlapping refreshes (a cron run and a user
 * clicking "check shop now", or two cron invocations) would each invalidate
 * the other's token and permanently break the link. The conditional UPDATE is
 * atomic in Postgres: exactly one caller can transition the row from
 * "unlocked" to "locked", and everyone else gets zero rows back.
 */
export async function acquireSession(accountId: string): Promise<RiotSession> {
  const now = new Date();
  const claimed = await prisma.linkedRiotAccount.updateMany({
    where: {
      id: accountId,
      OR: [{ refreshLockedUntil: null }, { refreshLockedUntil: { lt: now } }],
    },
    data: { refreshLockedUntil: new Date(now.getTime() + REFRESH_LOCK_MS) },
  });

  if (claimed.count === 0) {
    throw new RiotError("UNAVAILABLE", "Another request for this account is already running. Try again in a moment.");
  }

  try {
    // Re-read inside the lease: another run may have rotated the token
    // between our read and our claim.
    const account = await prisma.linkedRiotAccount.findUnique({
      where: { id: accountId },
      select: { encryptedRefreshToken: true },
    });
    if (!account) throw new RiotError("UNEXPECTED", "Linked account not found");

    const session = await createSessionFromRefreshToken(decryptSecret(account.encryptedRefreshToken));

    // Persist the rotated token immediately - before any of the work that
    // uses it. If the shop call later fails, we must still have stored the
    // only refresh token that now works.
    await prisma.linkedRiotAccount.update({
      where: { id: accountId },
      data: { encryptedRefreshToken: encryptSecret(session.refreshToken), refreshLockedUntil: null },
    });

    return session;
  } catch (err) {
    // Release the lease on failure so a transient error doesn't wedge the
    // account for the full lock duration.
    await prisma.linkedRiotAccount
      .update({ where: { id: accountId }, data: { refreshLockedUntil: null } })
      .catch(() => {});
    throw err;
  }
}

/**
 * Records real VP prices observed in a storefront response.
 *
 * Riot withdrew the full-catalogue price endpoint, so prices accrue instead:
 * every shop check contributes the four daily offers plus every item in
 * whatever bundles are featured, and coverage grows as the store rotates.
 * That's slower than a bulk sync but it is *real* data, and it costs nothing
 * - this was already in a response we fetch and parse.
 *
 * Prices are keyed by skin level; a skin takes the lowest observed level
 * price, which is the "buy this skin" cost (higher levels are Radianite
 * upgrades, not separate VP purchases). Existing values are overwritten
 * because the newer observation is the more current one.
 */
async function recordObservedPrices(prices: Map<string, number>): Promise<number> {
  if (prices.size === 0) return 0;

  const levels = await prisma.skinLevel.findMany({
    where: { id: { in: [...prices.keys()] } },
    select: { id: true, skinId: true },
  });

  const priceBySkin = new Map<string, number>();
  for (const level of levels) {
    const price = prices.get(level.id);
    if (price === undefined) continue;
    const existing = priceBySkin.get(level.skinId);
    if (existing === undefined || price < existing) priceBySkin.set(level.skinId, price);
  }
  if (priceBySkin.size === 0) return 0;

  await prisma.$transaction(
    [...priceBySkin.entries()].map(([skinId, priceVp]) =>
      prisma.skin.update({ where: { id: skinId }, data: { priceVp } }),
    ),
  );
  return priceBySkin.size;
}

/**
 * One poll for one linked account: refresh the session, read the rotation,
 * record what was seen. Records the failure reason on the account before
 * rethrowing, so the caller only has to count outcomes.
 */
export async function runShopCheck(linkedAccountId: string): Promise<ShopCheckResult> {
  const account = await prisma.linkedRiotAccount.findUnique({
    where: { id: linkedAccountId },
    select: { id: true, userId: true },
  });
  if (!account) throw new RiotError("UNEXPECTED", "Linked account not found");

  try {
    const session = await acquireSession(account.id);
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
      // One row per (account, skin) ever seen - bounded by catalog size, not
      // time. Powers "last seen N days ago" / "seen N times".
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
          // Clears any expiry warning from a past episode - see
          // notifyRiotLinkExpired. Harmless no-op when it was already null.
          expiryNotifiedAt: null,
        },
      }),
    ]);

    // Catalog-wide price data, harvested from the response we just made
    // anyway. Best-effort and after the check's own writes: prices are a
    // bonus, and failing to store one must not fail the shop check.
    const pricesRecorded = await recordObservedPrices(shop.prices).catch(() => 0);

    // Wishlist-match notification is best-effort and strictly after the
    // check's own data is safely persisted above - a Discord hiccup here
    // must not turn a successful shop read into a reported failure.
    await notifyWishlistMatches(account.userId, skinIds).catch(() => {});

    return { skinIds, unresolvedOfferIds, nextPollAt, pricesRecorded };
  } catch (err) {
    await recordFailure(account.id, err);
    throw err;
  }
}

export interface DueCheckSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  /** Links deleted for going unused - see STALE_LINK_DAYS. */
  expired: number;
}

// How long a link may sit unused before it is dropped. A stored Riot
// credential is the one thing in this database worth stealing (docs/RISKS.md),
// so a link nobody is using is pure liability: it can still mint a live Riot
// session but produces nothing for its owner. Six months is well past any
// plausible "I'll come back to it", and re-linking costs the user one sign-in.
const STALE_LINK_DAYS = 180;

// Refuse to delete a majority of all links in one run. A filter that
// accidentally matches everything - an inverted comparison, a cutoff computed
// from the wrong units - is a plausible mistake, and the query it feeds
// permanently destroys stored Riot credentials. A dry run against a healthy
// database would not reveal it either, because the query is *supposed* to
// return nothing there. Bounding the blast radius is the only cheap guard.
//
// Only applied once there are enough links for a proportion to mean anything.
// Below that, "half the links" is one or two rows, and a legitimate cleanup of
// a nearly-unused app would trip the guard on every run for no benefit.
const EXPIRY_GUARD_MIN_LINKS = 5;
const EXPIRY_GUARD_MAX_SHARE = 0.5;

/**
 * Which links count as abandoned.
 *
 * Stale means *every* trace of activity predates the cutoff, so the clauses are
 * ANDed. Three independent signals, because each alone is misleading:
 *
 *   createdAt          Always required, so a link made moments ago can never
 *                      match however the other columns look.
 *   lastSyncedAt       Only moves on a SUCCESSFUL poll, so it is null for any
 *                      link the scheduled poller has never reached.
 *   lastManualCheckAt  Stamped on every manual "check shop now", success or
 *                      failure. This is the signal that represents a user
 *                      actually asking for something, which is why a link kept
 *                      alive only by the button is not abandoned.
 *
 * Reading `lastSyncedAt: null` as evidence of abandonment on its own would be
 * wrong: it is also the state of every link when no poller is running, so the
 * first scheduled run after a long gap would delete links belonging to active
 * users rather than the ones nobody wants.
 *
 * Deliberately not driven by `nextPollAt`: EXPIRED and CAPTCHA_BLOCKED accounts
 * have theirs cleared and are never polled again, so they would otherwise sit
 * forever - and those are exactly the abandoned ones most worth removing.
 *
 * Exported so the cutoff can be unit-tested without a database.
 */
export function buildStaleLinkFilter(now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_LINK_DAYS * 24 * 60 * 60 * 1000);
  return {
    AND: [
      { createdAt: { lt: cutoff } },
      { OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: cutoff } }] },
      { OR: [{ lastManualCheckAt: null }, { lastManualCheckAt: { lt: cutoff } }] },
    ],
  };
}

/**
 * True when deleting `stale` out of `total` links is too large a share to do
 * unattended. Exported for tests: the whole point is that this decision is
 * never exercised in normal operation, so it needs proving in isolation.
 */
export function exceedsExpiryGuard(stale: number, total: number): boolean {
  if (total < EXPIRY_GUARD_MIN_LINKS) return false;
  return stale / total > EXPIRY_GUARD_MAX_SHARE;
}

/**
 * Deletes links that have gone unused, independently of the poll loop.
 *
 * Deleting matches what unlinkRiotAccount does, so the stored token goes with
 * the row and the sighting stats cascade. Loadouts and wishlist items hang off
 * the user rather than the link, so they are untouched - what a returning user
 * loses is a connection they were not using, and re-linking is one sign-in.
 */
async function expireStaleLinks(): Promise<number> {
  const where = buildStaleLinkFilter();

  // Counted before deleting so the guard can weigh what is about to happen.
  // The common case is nothing to do, so the second count is only paid for
  // when there is actually something to delete - this runs on every poll
  // batch.
  const stale = await prisma.linkedRiotAccount.count({ where });
  if (stale === 0) return 0;

  const total = await prisma.linkedRiotAccount.count();

  if (exceedsExpiryGuard(stale, total)) {
    console.error(
      `[check-shops] REFUSING to expire ${stale} of ${total} link(s) - more than ` +
        `${EXPIRY_GUARD_MAX_SHARE * 100}% in one run. Nothing was deleted. This is either a genuine ` +
        `mass abandonment or a bug in buildStaleLinkFilter; check before clearing it by hand.`,
    );
    return 0;
  }

  const { count } = await prisma.linkedRiotAccount.deleteMany({ where });
  if (count > 0) console.log(`[check-shops] removed ${count} link(s) unused for ${STALE_LINK_DAYS}+ days`);
  return count;
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
  // Before polling, so a stale link is never woken up just to be dropped.
  const expired = await expireStaleLinks();

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

  return { attempted: due.length, succeeded, failed, expired };
}

async function recordFailure(linkedAccountId: string, err: unknown): Promise<void> {
  const riotError = isRiotError(err) ? err : null;

  // Only ever persist our own message text. An arbitrary thrown error could
  // carry a request body or header in its message, and CLAUDE.md forbids
  // tokens reaching logs or error reporting.
  const message = riotError?.message ?? "An unexpected problem occurred while checking your shop.";
  const status = riotError?.accountStatus ?? LinkedAccountStatus.ERROR;

  // A retryable blip shouldn't push the account to tomorrow - try again in an
  // hour. A non-retryable one (expired login, hard block) waits for the user,
  // so it gets no next poll at all rather than a retry loop.
  const nextPollAt = riotError?.isRetryable ? new Date(Date.now() + 60 * 60 * 1000) : null;

  await prisma.linkedRiotAccount.update({
    where: { id: linkedAccountId },
    data: { status, lastError: message, nextPollAt },
  });

  // Best-effort and deliberately last: notifyRiotLinkExpired re-reads the
  // row (including expiryNotifiedAt) itself, so it's fine for this to run
  // after the update above rather than racing it.
  if (status === LinkedAccountStatus.EXPIRED) {
    await notifyRiotLinkExpired(linkedAccountId).catch(() => {});
  }
}
