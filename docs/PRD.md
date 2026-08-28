# Product Requirements

## Problem

VALORANT players who care about cosmetics currently juggle several disconnected tools: a Discord bot to see their daily shop, a wiki-style site to browse skins, maybe a spreadsheet or note for "skins I want," and nothing that ties those together. Nothing on the market lets someone build out a full ideal loadout, keep a proper wishlist, browse the full skin catalog in a genuinely nice UI, and get notified the moment a wanted skin appears in rotation — as one product.

## Target user

A VALORANT player who cares about their in-game appearance enough to plan purchases rather than buy on impulse when the shop happens to show something good. Doesn't need to be a whale — the wishlist/notification loop is arguably more valuable to someone budgeting VP carefully than to someone who buys everything anyway.

## Core features (v1 scope)

1. **Skin gallery** — every skin ever released, browsable and filterable (by weapon, rarity/tier, collection, price, release date). Each skin gets a real showcase: images, and animation/video where the underlying data provides it, not just a static icon.
2. **Loadout builder** — pick a skin (and variant/chroma, buddy) for every weapon slot to assemble a full "ideal loadout," save it, revisit and edit it.
3. **Wishlist** — a lighter-weight "skins I want" list, independent of a committed loadout, with running VP cost so a user can see what a wishlist would cost to complete.
4. **Store notifications** — link a Riot account; when a wishlisted skin appears in that account's daily shop, notify the user. This is the feature that makes the wishlist actually useful instead of just a list.
5. **Account linking** — connect a Riot account for the notification feature. Must be clearly opt-in, with plain-language disclosure of what this does and the (small but real) risk profile — see `RISKS.md`.

## Nice-to-haves (post-v1, not blocking)

- Loadout sharing (public link / image export)
- "What's in the shop right now" view even without a wishlist match
- Night market tracking
- Bundle browsing alongside individual skins
- Price/VP budgeting tools, rotation-odds estimates
- Multiple linked accounts per user (smurfs)

## Explicitly out of scope for v1

- Anything that writes to or modifies a Riot account (equipping skins remotely, spending VP, etc.) — read-only integration only
- Mobile native apps — web-first, responsive
- Any feature that requires Riot's official partner approval/API access beyond what's publicly available today

## Success criteria (informal, personal-project scale)

- A user can browse the full current skin catalog and it feels good to look at, not like a spreadsheet
- A user can build a loadout and a wishlist without friction
- A user actually gets notified in time to act, for at least the accounts we test against
- Nothing about the credential/account-linking flow feels sketchy to a user reading it

## Competitive landscape (for reference, findings from initial research)

- **Wishlist/locker trackers:** VALOWISH (closest existing analog — wishlist + owned-skin tracking + VP planning, but no notifications or loadout builder), ValoGuide inventory builder, Valo Vault, ValTracker, locker.gg/valorant.
- **Store-notification bots:** SkinPeek (most fully-featured, Discord-only, repo archived June 2025) and several smaller forks/clones, all Discord bots rather than webapps.
- **Skin databases:** thespike.gg, valorantstrike.com, valohub.co, valoskinsdb.com, valorantknives.gg — static list/image catalogs, none with an immersive animation-forward gallery.
- **Data source:** valorant-api.com, the unofficial community API almost everything above is built on.

No existing product combines gallery + loadout builder + wishlist + notifications in one webapp — that's the gap.
