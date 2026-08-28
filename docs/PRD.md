# Product Requirements

## Problem

VALORANT players who care about cosmetics currently juggle several disconnected tools: a Discord bot to see their daily shop, a wiki-style site to browse skins, maybe a spreadsheet or note for "skins I want," and nothing that ties those together. Nothing on the market lets someone build out a full ideal loadout, keep a proper wishlist, browse the full skin catalog in a genuinely nice UI, and get notified the moment a wanted skin appears in rotation — as one product.

## Target user

A VALORANT player who cares about their in-game appearance enough to plan purchases rather than buy on impulse when the shop happens to show something good. Doesn't need to be a whale — the wishlist/notification loop is arguably more valuable to someone budgeting VP carefully than to someone who buys everything anyway.

## Core features (v1 scope)

1. **Skin gallery** — every skin ever released for every weapon and knife, plus every buddy, browsable and filterable (by weapon, rarity/tier, collection, price, release date). Each skin gets a real showcase: high-res images, animation/video where the underlying data provides it, and polished presentation (zoom, smooth transitions) — not a static icon grid.
   - **Landing view:** one unified "all skins" grid by default, with weapon as a filter facet rather than a forced drill-down — browsing "what's cool" matters more here than hunting a specific weapon. Buddies get their own section (different item shape).
   - **Filters:** weapon/category, rarity tier (with Riot's own tier icon), collection/bundle, price (VP), release date, "has animation," **color** (dominant color family, extracted per skin and per chroma — a skin with multiple color variants can match several color filters), and **vibe** (dark, sleek, futuristic, elegant, aggressive, cute, retro, neon, anime, etc. — AI-assigned per skin at sync time, see `ARCHITECTURE.md`). Free-text search always available. Sort: newest first (default), price, alphabetical, rarity.
   - **Skin detail page:** levels (a skin's upgrade tiers — visual/audio/finisher unlocks) as a selector, chromas as color swatches that swap the preview instantly, and an inline buddy preview (pick a buddy, see it overlaid on the weapon).
   - **Performance:** the catalog is large (1500+ skins across years) — virtualized grid, lazy-loaded thumbnails, video plays on hover/open rather than autoplaying the whole grid.
2. **Loadout builder** — pick a skin (and level, chroma, buddy) for every weapon slot to assemble a full "ideal loadout," save it, revisit and edit it. Buddies are shown attached to the weapon (overlaid at the strap/grip anchor point), not just listed separately, so a loadout actually looks like the finished product.
   - **Slots mirror the real game 1:1** — one skin per weapon (Classic through Odin, plus Melee/knife), matching how VALORANT actually lets you equip skins. A loadout can be partial; slots don't need to be filled to save it.
   - **Aspirational, not inventory-gated** — a user can pick any skin/level/chroma regardless of whether they actually own it. This is a planning tool for the target user who plans purchases, not an owned-items tracker (that's the separate, lower-priority "my collection" view).
   - **Board layout** — all slots visible at once, like a locker/armory, each showing its currently assigned skin+buddy thumbnail; click a slot to open the picker. The picker is the gallery's filter/search UI (including color/vibe) scoped to that weapon, so building a loadout feels like an extension of browsing, not a separate form.
   - **Multiple named loadouts** per user, with duplicate-as-starting-point (useful for trying a variation without losing the original) and a running VP cost total.
   - **Personality/vibe as the through-line:** the point of the color/vibe filters isn't just search convenience — it's so a user can deliberately build a loadout that matches an aesthetic they identify with ("dark and sleek," "neon and loud") rather than picking skins one-off. See the vibe-based onboarding idea below.
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
- **Vibe-based onboarding** — a lightweight first-visit flow where a user picks a few vibe/color tags they identify with, which pre-filters the gallery and can seed a starter loadout suggestion. Gives a user's profile a bit of identity ("your aesthetic: dark & sleek") rather than starting from a blank grid. Depends on the vibe-tagging pipeline existing first, so it's naturally sequenced after the core gallery filters ship.
- **"Match my vibe" suggestions** in the loadout builder — once a few slots are filled, suggest skins for the remaining slots whose color/vibe tags match what's already picked, so a loadout stays coherent without the user manually cross-checking every slot.

## Explicitly out of scope for v1

- Anything that writes to or modifies a Riot account (equipping skins remotely, spending VP, etc.) — read-only integration only
- Mobile native apps — web-first, responsive
- Any feature that requires Riot's official partner approval/API access beyond what's publicly available today
- **A true 3D drag/rotate weapon inspect view.** Considered and explicitly declined — see `RISKS.md`. No legitimate data source (including valorant-api.com) exposes 3D models; building this would require ripping game assets, a materially bigger risk than anything else this project accepts. The gallery instead invests in a polished 2D/video presentation.

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
