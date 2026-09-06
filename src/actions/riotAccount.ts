"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { linkRiotAccount, runShopCheck } from "@/store-check";
import { isRiotError } from "@/riot/errors";
import { LimitExceededError, MANUAL_SHOP_CHECK_COOLDOWN_MS } from "@/lib/limits";

// Actions return a result object instead of throwing for expected failures
// (bad cookie, expired session, Riot blocked us). A thrown Server Action
// error surfaces as an opaque "something went wrong" in production and, worse,
// risks the raw error text reaching a log - and the input here is adjacent to
// a credential. Every message below is one this codebase wrote.
export type RiotActionResult = { ok: true; message: string } | { ok: false; message: string };

function toMessage(err: unknown): string {
  // RiotError messages are authored in src/riot/*, are user-facing by design,
  // and never contain a token. LimitExceededError messages are written in
  // src/lib/limits.ts and are user-facing for the same reason. Anything else
  // is deliberately generic - an arbitrary error's message could carry
  // request internals.
  if (isRiotError(err)) return err.message;
  if (err instanceof LimitExceededError) return err.message;
  return "Something went wrong talking to Riot. Please try again in a bit.";
}

/**
 * Takes the pasted `ssid` cookie, proves it works by using it, and stores it
 * encrypted. The value is never logged and never leaves this request except
 * as a `Cookie` header to Riot itself.
 */
export async function linkRiotAccountAction(ssid: string): Promise<RiotActionResult> {
  const userId = await getCurrentUserId();

  try {
    const result = await linkRiotAccount(userId, ssid);
    revalidatePath("/account");
    const who = result.gameName ? `${result.gameName}#${result.tagLine ?? "?"}` : "your account";
    return { ok: true, message: `Linked ${who} (${result.region.toUpperCase()}).` };
  } catch (err) {
    return { ok: false, message: toMessage(err) };
  }
}

/**
 * Manual "check my shop now". The scheduled poller will do this on its own
 * cadence, but an on-demand path makes the feature verifiable immediately
 * after linking instead of only at the next rotation.
 *
 * Rate-limited per account. This is the only path in the app where a user
 * action directly causes outbound Riot traffic, and each run refreshes (and
 * therefore rotates) the OAuth token as well as reading the shop - so an
 * unthrottled button is exactly the "aggressive polling" docs/RISKS.md says
 * draws attention to unofficial integrations.
 */
export async function checkShopNowAction(linkedAccountId: string): Promise<RiotActionResult> {
  const userId = await getCurrentUserId();
  const account = await prisma.linkedRiotAccount.findUnique({
    where: { id: linkedAccountId },
    select: { userId: true, lastManualCheckAt: true },
  });
  if (!account || account.userId !== userId) return { ok: false, message: "Linked account not found." };

  const since = account.lastManualCheckAt ? Date.now() - account.lastManualCheckAt.getTime() : Infinity;
  if (since < MANUAL_SHOP_CHECK_COOLDOWN_MS) {
    const wait = Math.ceil((MANUAL_SHOP_CHECK_COOLDOWN_MS - since) / 1000);
    return {
      ok: false,
      message: `Just checked. Your shop only rotates once a day - try again in ${wait}s.`,
    };
  }

  // Stamped before the call, not after, and deliberately not derived from
  // lastSyncedAt: that only moves on success, which would leave the
  // retry-a-failure path - the one most likely to be hammered, and the one
  // most likely to be hitting a block already - completely unthrottled.
  await prisma.linkedRiotAccount.update({
    where: { id: linkedAccountId },
    data: { lastManualCheckAt: new Date() },
  });

  try {
    const result = await runShopCheck(linkedAccountId);
    revalidatePath("/account");
    const skipped = result.unresolvedOfferIds.length;
    return {
      ok: true,
      message:
        `Read your shop: ${result.skinIds.length} skins recorded` +
        (skipped > 0 ? `, ${skipped} not in our catalog yet (run the sync job).` : "."),
    };
  } catch (err) {
    // runShopCheck already recorded the status on the account before
    // rethrowing, so the page will reflect it after revalidation.
    revalidatePath("/account");
    return { ok: false, message: toMessage(err) };
  }
}

// Unlinking is a plain delete of a row this user owns. RISKS.md requires this
// path exist regardless of the rest of the subsystem's state: "have a clean
// path for a user to unlink their account and have their token deleted."
export async function unlinkRiotAccount(linkedAccountId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const account = await prisma.linkedRiotAccount.findUnique({
    where: { id: linkedAccountId },
    select: { userId: true },
  });
  if (!account || account.userId !== userId) throw new Error("Linked account not found");

  await prisma.linkedRiotAccount.delete({ where: { id: linkedAccountId } });
  revalidatePath("/account");
}
