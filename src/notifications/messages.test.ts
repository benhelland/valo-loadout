// Discord rejects an oversized or malformed embed with a 400 and no other
// signal - the DM simply never arrives, and nothing in this codebase would
// notice. The caps below are Discord's own, restated here rather than
// imported so the test fails if the builder's copy of them drifts.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildWishlistMatchMessage, buildLinkExpiredMessage, type WishlistMatchSkin } from "@/notifications/messages";
import type { DiscordMessagePayload } from "@/discord/bot";

const MAX_CONTENT = 2000;
const MAX_TITLE = 256;
const MAX_DESCRIPTION = 4096;
const MAX_FOOTER = 2048;
const MAX_EMBEDS = 10;
const MAX_TOTAL_EMBED_CHARS = 6000;

const APP_URL = "https://example.invalid";

function assertWithinDiscordCaps(payload: DiscordMessagePayload): void {
  assert.ok((payload.content?.length ?? 0) <= MAX_CONTENT, "content exceeds Discord's cap");

  const embeds = payload.embeds ?? [];
  assert.ok(embeds.length <= MAX_EMBEDS, `${embeds.length} embeds exceeds Discord's cap`);

  let total = 0;
  for (const embed of embeds) {
    assert.ok((embed.title?.length ?? 0) <= MAX_TITLE, "embed title exceeds Discord's cap");
    assert.ok((embed.description?.length ?? 0) <= MAX_DESCRIPTION, "embed description exceeds Discord's cap");
    assert.ok((embed.footer?.text.length ?? 0) <= MAX_FOOTER, "embed footer exceeds Discord's cap");
    total += (embed.title?.length ?? 0) + (embed.description?.length ?? 0) + (embed.footer?.text.length ?? 0);
  }
  assert.ok(total <= MAX_TOTAL_EMBED_CHARS, `${total} chars across embeds exceeds Discord's cap`);

  // A stringified undefined in a URL is a 400 for the whole message, and it
  // is the shape a missing field silently produces.
  for (const embed of embeds) {
    for (const url of [embed.url, embed.thumbnail?.url]) {
      if (url !== undefined) assert.ok(!url.includes("undefined"), `malformed URL: ${url}`);
    }
  }
}

function skin(over: Partial<WishlistMatchSkin> = {}): WishlistMatchSkin {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    displayName: "Sample Skin",
    displayIconUrl: "https://example.invalid/icon.png",
    priceVp: 1775,
    ...over,
  };
}

describe("buildWishlistMatchMessage", () => {
  it("builds one embed per skin, linked to its detail page", () => {
    const payload = buildWishlistMatchMessage({
      skins: [skin({ id: "a" }), skin({ id: "b" })],
      accountLabel: "Player#NA1",
      appUrl: APP_URL,
    });

    assert.equal(payload.embeds?.length, 2);
    assert.equal(payload.embeds?.[0].url, `${APP_URL}/skins/a`);
    assert.equal(payload.embeds?.[1].url, `${APP_URL}/skins/b`);
    assert.match(payload.content ?? "", /2 wishlist skins are in today's shop/);
    assertWithinDiscordCaps(payload);
  });

  it("omits the thumbnail entirely when a skin has no icon", () => {
    const payload = buildWishlistMatchMessage({
      skins: [skin({ displayIconUrl: null })],
      accountLabel: null,
      appUrl: APP_URL,
    });

    assert.equal(payload.embeds?.length, 1);
    assert.equal(payload.embeds?.[0].thumbnail, undefined);
    assert.match(payload.content ?? "", /1 wishlist skin is in today's shop/);
    assertWithinDiscordCaps(payload);
  });

  it("omits the price line when the skin has no VP price", () => {
    const payload = buildWishlistMatchMessage({
      skins: [skin({ priceVp: null })],
      accountLabel: null,
      appUrl: APP_URL,
    });

    assert.equal(payload.embeds?.[0].description, undefined);
    assertWithinDiscordCaps(payload);
  });

  it("names the account in the footer when one is given, and omits it otherwise", () => {
    const labelled = buildWishlistMatchMessage({ skins: [skin()], accountLabel: "Player#NA1", appUrl: APP_URL });
    assert.match(labelled.embeds?.[0].footer?.text ?? "", /Player#NA1/);

    const unlabelled = buildWishlistMatchMessage({ skins: [skin()], accountLabel: null, appUrl: APP_URL });
    assert.equal(unlabelled.embeds?.[0].footer, undefined);
  });

  it("keeps all four of a full shop's offers", () => {
    const payload = buildWishlistMatchMessage({
      skins: ["a", "b", "c", "d"].map((id) => skin({ id, displayName: "Champions 2022 Vandal" })),
      accountLabel: "Player#NA1",
      appUrl: APP_URL,
    });

    assert.equal(payload.embeds?.length, 4);
    assertWithinDiscordCaps(payload);
  });

  it("stays inside every cap on a payload no caller should ever build", () => {
    const payload = buildWishlistMatchMessage({
      skins: Array.from({ length: 20 }, (_, i) =>
        skin({ id: `skin-${i}`, displayName: "X".repeat(5000), displayIconUrl: null, priceVp: 99_999 }),
      ),
      accountLabel: "Y".repeat(5000),
      appUrl: APP_URL,
    });

    // A shop has four offers, so the list is capped there regardless of what
    // the caller passes - and trimmed further if those four still would not
    // fit Discord's combined character budget.
    assert.ok((payload.embeds?.length ?? 0) <= 4);
    assertWithinDiscordCaps(payload);
  });
});

describe("buildLinkExpiredMessage", () => {
  it("points the user at the account page, with and without an account label", () => {
    for (const accountLabel of ["Player#NA1", null]) {
      const payload = buildLinkExpiredMessage({ accountLabel, appUrl: APP_URL });
      assert.match(payload.content ?? "", new RegExp(`${APP_URL}/account`));
      assertWithinDiscordCaps(payload);
    }
  });

  it("stays inside the content cap on an absurdly long account label", () => {
    const payload = buildLinkExpiredMessage({ accountLabel: "Z".repeat(5000), appUrl: APP_URL });
    assertWithinDiscordCaps(payload);
  });
});
