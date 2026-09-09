import type { DiscordEmbed, DiscordMessagePayload } from "@/discord/bot";

// Pure formatting for the DMs this app sends. No Prisma, no fetch, no env
// reads - the app URL is passed in - so the payloads are testable without a
// database or a bot token (src/notifications/messages.test.ts).
//
// Discord rejects an oversized or malformed embed with a 400 and no other
// signal: the message simply never arrives. Every cap below is Discord's, and
// applying them here is what keeps that failure impossible rather than merely
// unlikely.
const MAX_CONTENT = 2000;
const MAX_TITLE = 256;
const MAX_TOTAL_EMBED_CHARS = 6000;

// Tighter than Discord's own description (4096) and footer (2048) limits,
// because neither field here is free text: a description is a price line and
// a footer is a Riot ID. Keeping them short is what guarantees four embeds
// always fit the combined budget, so the trim below can never be what a real
// shop hits.
const MAX_DESCRIPTION = 128;
const MAX_FOOTER = 96;

// The daily shop has exactly four offers, so this can never bite in practice.
// It exists so a caller passing a larger list cannot build an oversized
// payload. Discord's own ceiling is 10 embeds.
const MAX_SKIN_EMBEDS = 4;

// --accent from src/app/globals.css.
const ACCENT_COLOR = 0xff4655;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function embedLength(embed: DiscordEmbed): number {
  return (embed.title?.length ?? 0) + (embed.description?.length ?? 0) + (embed.footer?.text.length ?? 0);
}

/**
 * Drops trailing embeds until the message is inside Discord's combined
 * character budget. Fewer skins shown beats a message Discord refuses.
 *
 * The first embed is always kept: the field caps above bound one embed well
 * under the combined budget, so it cannot be the thing that overflows, and
 * returning an empty list would leave a summary line describing nothing.
 */
function fitTotalBudget(embeds: DiscordEmbed[]): DiscordEmbed[] {
  const kept: DiscordEmbed[] = [];
  let total = 0;
  for (const embed of embeds) {
    const length = embedLength(embed);
    if (kept.length > 0 && total + length > MAX_TOTAL_EMBED_CHARS) break;
    kept.push(embed);
    total += length;
  }
  return kept;
}

export interface WishlistMatchSkin {
  id: string;
  displayName: string;
  displayIconUrl: string | null;
  priceVp: number | null;
}

export function buildWishlistMatchMessage(input: {
  skins: WishlistMatchSkin[];
  /** "Name#Tag" of the account whose shop matched, when known. */
  accountLabel: string | null;
  appUrl: string;
}): DiscordMessagePayload {
  const skins = input.skins.slice(0, MAX_SKIN_EMBEDS);
  const footer = input.accountLabel ? { text: truncate(`Shop for ${input.accountLabel}`, MAX_FOOTER) } : undefined;

  const embeds = skins.map((skin) => {
    const embed: DiscordEmbed = {
      title: truncate(skin.displayName, MAX_TITLE),
      url: `${input.appUrl}/skins/${skin.id}`,
      color: ACCENT_COLOR,
      footer,
    };
    // Discord rejects the whole message on an invalid embed URL, so a missing
    // icon has to degrade to a text-only embed rather than a null thumbnail.
    if (skin.displayIconUrl) embed.thumbnail = { url: skin.displayIconUrl };
    if (skin.priceVp !== null) {
      embed.description = truncate(`**${skin.priceVp.toLocaleString("en-US")} VP**`, MAX_DESCRIPTION);
    }
    return embed;
  });

  // Counted from what survived the trim, not from the input: a summary
  // promising four skins above a list of two is worse than a smaller number.
  const kept = fitTotalBudget(embeds);
  const noun = kept.length === 1 ? "skin" : "skins";
  const verb = kept.length === 1 ? "is" : "are";
  return {
    // A summary line as well as the embeds, so the message still says
    // something if a client collapses them.
    content: truncate(`🎯 ${kept.length} wishlist ${noun} ${verb} in today's shop.`, MAX_CONTENT),
    embeds: kept,
  };
}

export function buildLinkExpiredMessage(input: {
  accountLabel: string | null;
  appUrl: string;
}): DiscordMessagePayload {
  const who = input.accountLabel ? `${input.accountLabel}'s` : "Your Riot account's";
  return {
    content: truncate(
      `⚠️ ${who} login expired, so Valoadout can't check your shop anymore. ` +
        `Re-link it to keep wishlist notifications going: ${input.appUrl}/account`,
      MAX_CONTENT,
    ),
  };
}

/**
 * Plain-language explanation of a failed delivery, shown on /account and
 * printed by the test-notification script. DMS_CLOSED is the only reason the
 * user can act on, so it is the only one that gets an instruction.
 */
export function deliveryFailureExplanation(reason: string | null): string {
  if (reason === "DMS_CLOSED") {
    return (
      "Discord wouldn't let us DM you. Turn Direct Messages back on for this app's server " +
      "(Server Settings → Privacy Settings → Direct Messages). The next check that reaches you clears this."
    );
  }
  return "We couldn't reach you on Discord last time. We'll try again on the next shop check.";
}
