# Product Requirements

## Problem

VALORANT players who care about cosmetics currently juggle several disconnected tools: a Discord bot to see their daily shop, a wiki-style site to browse skins, maybe a spreadsheet or note for "skins I want," and nothing that ties those together. Nothing on the market lets someone build out a full ideal loadout, keep a proper wishlist, browse the full skin catalog in a genuinely nice UI, and get notified the moment a wanted skin appears in rotation — as one product.

## Target user

A VALORANT player who cares about their in-game appearance enough to plan purchases rather than buy on impulse when the shop happens to show something good. Doesn't need to be a whale — the wishlist/notification loop is arguably more valuable to someone budgeting VP carefully than to someone who buys everything anyway.

## Core features (v1 scope)

1. **Skin gallery** — every skin ever released for every weapon and knife, plus every buddy, browsable and filterable (by weapon, rarity/tier, collection, price, release date). Each skin gets a real showcase: high-res images, animation/video where the underlying data provides it, and polished presentation (zoom, smooth transitions) — not a static icon grid.
   - **Landing view:** one unified "all skins" grid by default, with weapon as a filter facet rather than a forced drill-down — browsing "what's cool" matters more here than hunting a specific weapon. Buddies get their own section (different item shape).
   - **Filters:** weapon/category, rarity tier (with Riot's own tier icon), collection/bundle, price (VP — **estimated** from rarity tier, valorant-api.com doesn't expose real prices; see `ARCHITECTURE.md`), release date, "has animation," **color** (dominant color family, extracted per skin and per chroma — a skin with multiple color variants can match several color filters), and **vibe** (dark, sleek, futuristic, elegant, aggressive, cute, retro, neon, anime, etc. — AI-assigned per skin at sync time, see `ARCHITECTURE.md`). Free-text search always available. Sort: newest first (default — exact for anything released after this project starts syncing, approximate for the historical catalog since no source provides real release dates), price, alphabetical, rarity.
   - **Skin detail page:** levels (a skin's upgrade tiers — visual/audio/finisher unlocks) as a selector, chromas as color swatches that swap the preview instantly, and a buddy picker shown as a badge in the preview frame (not composited onto the weapon render — see `ARCHITECTURE.md` "Buddy pairing" for why a flat-image composite was tried and dropped).
   - **Performance:** the catalog is large (1500+ skins across years) — virtualized grid, lazy-loaded thumbnails, video plays on hover/open rather than autoplaying the whole grid.
2. **Loadout builder** — pick a skin (and level, chroma, buddy) for every weapon slot to assemble a full "ideal loadout," save it, revisit and edit it. Each filled slot shows its skin thumbnail with the buddy as a small badge on it (same badge treatment as the skin detail page), not composited onto the weapon render.
   - **Slots mirror the real game 1:1** — one skin per weapon (Classic through Odin, plus Melee/knife), matching how VALORANT actually lets you equip skins. A loadout can be partial; slots don't need to be filled to save it.
   - **Aspirational, not inventory-gated** — a user can pick any skin/level/chroma regardless of whether they actually own it. This is a planning tool for the target user who plans purchases, not an owned-items tracker. (A separate "my collection" owned-skins view was considered but deferred — not yet designed, see `ROADMAP.md` Phase 4. It would need a different Riot endpoint and data-minimization stance than store notifications use, which is real design work, not a small add-on.)
   - **Board layout** — a 4-column grid grouped by category (Sidearms | SMGs+Shotguns | Rifles+Melee | Snipers+Heavy), every slot visible at once like a locker/armory, matching a reference loadout-chart layout supplied directly. Each tile shows its assigned skin render with the buddy as a small icon docked beside it, and the weapon name in a label bar below. Clicking a filled slot pops up a small "View / Replace" choice (View jumps to that exact skin+level+chroma+buddy combo via a `/combo/:encoded` link so the picked variant is preserved, not the skin's defaults; Replace opens the picker); clicking an empty slot goes straight to the picker. The picker is the gallery's filter/search UI (including color/vibe) scoped to that weapon, so building a loadout still feels like an extension of browsing, not a separate form. (An earlier version matched the real client's own "category tabs + one weapon at a time" navigation instead — replaced once given this specific reference layout to build to.)
   - **Multiple named loadouts** per user, with duplicate-as-starting-point (useful for trying a variation without losing the original) and a running estimated VP cost total.
   - **Loadout switcher:** a lightweight list/dropdown of a user's named loadouts to jump between while building/browsing — swapping which loadout you're looking at should be one click, not a navigation trip.
   - **Personality/vibe as the through-line:** the point of the color/vibe filters isn't just search convenience — it's so a user can deliberately build a loadout that matches an aesthetic they identify with ("dark and sleek," "neon and loud") rather than picking skins one-off. See the vibe-based onboarding idea below.
3. **Sharing** — send a link, no account or app install needed on the recipient's end, no integrated social graph (no comments/likes/follows/discovery feed — link-only distribution).
   - **Whole-loadout links:** opt-in per loadout (a "make shareable" toggle) — loadouts are private by default, not publicly viewable just by existing. The link is live (reflects the loadout's current state, not a frozen snapshot at share time) and can be revoked/regenerated to kill an old link.
   - **Skin-combo links:** share one specific skin + level + chroma + buddy combination — e.g. "check out this skin with this buddy on it." Stateless: nothing is saved to generate one, the link just encodes the catalog IDs directly, so it's instant and needs no revocation (there's nothing user-owned in it).
   - **Shared page:** read-only, viewable without logging in, reuses the same board/detail visuals as the app itself, carries the required "not affiliated with Riot" disclosure, and a "build your own" link back into the app.
4. **Wishlist** — a lighter-weight "skins I want" list, independent of a committed loadout, with running estimated VP cost so a user can see what a wishlist would cost to complete.
5. **Store notifications** — link a Riot account; when a wishlisted skin appears in that account's daily shop, notify the user. This is the feature that makes the wishlist actually useful instead of just a list.
   - **Channel (v1): Discord bot DM, automatic off the user's existing Discord sign-in — not a manually-configured webhook.** Fits the audience (this space already lives in Discord — see competitive landscape below), needs no email infra, and needs no setup step beyond the signup + Riot-link the user already does — see `ARCHITECTURE.md` "Notifications subsystem detail" for why a webhook URL couldn't meet that bar. Email/push are deferred, not designed away.
   - **Batched, not per-item:** one notification per shop reset ("3 of your wishlist skins are in today's shop," with thumbnails), not a ping per matching skin.
   - **No duplicate notifications** for the same daily rotation, even if the app happens to poll that account more than once before the next reset.
   - **"Last seen" stat, for any tracked skin, not just wishlist matches** — "last seen 47 days ago" / "seen 3 times since you linked your account," shown on a skin's detail page once an account is linked. A lightweight payoff from the same daily poll, and a reason to link an account beyond just notifications.
6. **Account linking** — connect a Riot account for the notification feature. Must be clearly opt-in, with plain-language disclosure of what this does and the (small but real) risk profile — see `RISKS.md`.
   - **Handles 2FA:** many Riot accounts have email-code two-factor enabled; the linking flow needs a code-entry step, not just a password box, or it silently fails to link a large fraction of real accounts.
   - **Honest failure states:** if Riot's login puts an account behind a CAPTCHA challenge (a real possibility for an unofficial auth flow — see `RISKS.md`), the user needs a clear "this account can't be linked right now" message, not a silent retry loop or a generic error.

## Nice-to-haves (post-v1, not blocking)

- **"My collection" / owned-skins view** — deferred, not yet designed (see `ROADMAP.md` Phase 4). Needs its own scoping pass: a different Riot endpoint (inventory, not shop) and its own data-minimization decision in `RISKS.md`, not a small add-on to the existing store-check subsystem.
- Loadout image export (a downloadable/postable image of a loadout board, distinct from the link-sharing that's now core v1 — see Sharing above)
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
