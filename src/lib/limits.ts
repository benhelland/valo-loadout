// Per-user ceilings on everything a signed-in user can create or trigger.
//
// None of these are close to binding for real use - they exist so that a
// single account (or a script driving one) cannot turn a free-tier database
// or Riot's rate limiter into someone else's problem. Every limit is enforced
// server-side in the Server Action, because that is the only place a client
// cannot skip.
//
// Two different concerns are covered here:
//
//   - Storage. Row counts and string lengths bound how much a single user can
//     write. Unbounded text is the sharper of the two: a row cap limits how
//     many names exist, but says nothing about how big one name is.
//   - Outbound calls to Riot. This is the one that isn't about cost at all.
//     docs/RISKS.md is explicit that aggressive polling is what gets
//     unofficial integrations noticed, and CLAUDE.md carries it as a
//     non-negotiable, so the manual "check now" button needs a floor between
//     presses that a user cannot click their way past.

/** Loadouts one user may own. The game has ~19 weapon slots; nobody needs 25 full sets. */
export const MAX_LOADOUTS_PER_USER = 25;

/** Wishlist entries one user may hold. The unique (userId, skinId) index already caps this at the catalog size (~1,400) - this is the tighter, more useful bound. */
export const MAX_WISHLIST_ITEMS_PER_USER = 300;

/** Characters in any user-supplied name (loadouts today). Long enough that no real name is refused, short enough that the column cannot be used as free storage. */
export const MAX_NAME_LENGTH = 60;

/** Riot accounts one user may link. More than a couple is indistinguishable from farming shop data. */
export const MAX_LINKED_RIOT_ACCOUNTS_PER_USER = 3;

/**
 * Floor between two manual shop checks on the same linked account.
 *
 * A shop rotates once a day, so a second check inside this window can't return
 * anything new - the only reason to send one is to hammer Riot. Five minutes
 * still leaves room to retry a transient failure by hand without waiting.
 */
export const MANUAL_SHOP_CHECK_COOLDOWN_MS = 5 * 60 * 1000;

/** Thrown when a user hits one of the ceilings above. Message is user-facing. */
export class LimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LimitExceededError";
  }
}

/** Trims and length-caps a user-supplied name, falling back when it's empty. */
export function normalizeName(name: unknown, fallback: string): string {
  if (typeof name !== "string") return fallback;
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed || fallback;
}
