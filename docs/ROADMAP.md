# Roadmap

Phased so the riskiest, least-necessary-first piece (Riot account linking) comes after there's already something worth using without it.

## Phase 0 — Scoping (current)

- [x] Market research on existing tools
- [x] `CLAUDE.md` / `PRD.md` / `ARCHITECTURE.md` / `RISKS.md` written
- [x] Confirm valorant-api.com's actual schema — see `ARCHITECTURE.md`. Two gaps found and resolved: no price data (static tier-based estimate) and no release date (our own `first_seen_in_sync_at`)
- [x] Lock in stack choice — see `ARCHITECTURE.md`

## Phase 1 — Skin gallery (no accounts, no auth)

The whole "cool UI to look at all skins ever, all the animations" half of the idea, shippable entirely from valorant-api.com with zero account risk. Also doubles as the proving ground for the content-sync pipeline Phase 2+ will reuse.

- [x] Sync job pulling skins/chromas/buddies from valorant-api.com into our DB — verified against the real Neon DB (5 tiers, 456 themes, 884 buddies, 20 weapons, 1405 skins, 2677 levels, 2921 chromas)
- [x] Color-family pass as part of the sync job — verified (1358/1405 skins, 2921/2921 chromas colored)
- [~] AI vibe-tagging pass — code written (`src/lib/vibeTagging.ts`, Haiku 4.5, structured output, fixed vocabulary), type-checks clean, **but untested against the live API**. Needs a real `ANTHROPIC_API_KEY` (separate Developer-API billing, not the user's Claude subscription — console.anthropic.com, pay-as-you-go). **Prompt the user to set this up** next time this comes up, so the vibe-tagging path actually gets verified before Phase 1 is called done. Estimated cost: ~$1-3 one-time backfill for the existing ~1400 skins, pennies/year after.
- [x] Gallery UI: browse/filter by weapon, tier, collection, color, vibe, animation, search; sort; pagination; skin detail view with image + video playback, level/chroma selectors, inline buddy preview — verified in the browser end to end, no console errors
- [x] Fuzzy predictive search (both the dropdown and the grid itself, consistently), auto-applying filters (no Apply button), a standalone `/buddies` browse gallery reachable via a secondary tab on the skin gallery, and a moveable/resizable/auto-fading buddy badge on the skin detail page — see `FEATURES.md` at the repo root for the full technical feature list this project has grown into
- [x] Stateless skin-combo share links (`/combo/:encoded`) — verified in the browser: encode/decode round-trips a skin+level+chroma+buddy selection through a base64url-packed path segment, garbled/tampered tokens fail closed to 404, no DB row involved
- [ ] Deployed and usable as a standalone thing, even before any other feature exists

## Phase 2 — Accounts, loadouts, wishlist

Still no Riot integration — this is our own app's accounts.

- [~] **Loadout builder built ahead of real auth, against a mock user** — explicit user call: build the feature first, wire up Discord OAuth after. `src/lib/auth.ts`'s `getCurrentUserId()` upserts a single hardcoded dev user and is the *only* place that reads "who's logged in" — swapping in a real Auth.js session is a one-function change. Board layout (all weapon slots visible, grouped Sidearms→Melee like the real buy menu), picker reuses the gallery's own filter/search UI scoped to one weapon (`/loadouts/[id]/weapon/[weaponId]`), assignment reuses the skin detail page verbatim with an added "Add to Loadout" action (`/loadouts/[id]/weapon/[weaponId]/skins/[skinId]`) — matches `PRD.md`'s "feels like an extension of browsing, not a separate form". Multiple named loadouts, switcher dropdown, duplicate, rename, delete, running estimated VP total — all built and verified end-to-end in the browser (create → assign → clear → duplicate → switch → delete, mobile stacking, console clean). Buddies show as the same corner badge as the skin detail page, not composited onto the weapon (`PRD.md`/`ARCHITECTURE.md` corrected to match). **Not done: real user auth** — still needed before this is usable by anyone but the mock dev user.
- [ ] User auth (our own accounts, not Riot's) — swap `getCurrentUserId()` over to a real Auth.js + Discord OAuth session
- [ ] Loadout share links (opt-in, revocable — see `ARCHITECTURE.md`)
- [ ] Wishlist: add/remove skins, running estimated VP total

## Phase 3 — Riot account linking + store notifications

The riskiest and most differentiated piece — see `RISKS.md` before starting this phase.

**Before starting this phase's implementation: prompt to switch to Opus.** This subsystem (Riot auth flow, 2FA/CAPTCHA handling, token encryption/refresh) is the security-sensitive, judgment-heavy part of the app — the rest of the build is well-specified enough for Sonnet, but this piece is worth the extra care. Remind the user to switch models before writing the store-check auth code.

- [ ] Riot auth flow (login → session token, password never persisted)
- [ ] Store-check subsystem: scheduled polling per linked account, isolated module per `ARCHITECTURE.md`
- [ ] Wishlist-match detection + notification dispatch, batched per reset, deduped (Discord webhook — see `PRD.md`)
- [ ] Account-linking UI with plain-language disclosure of what this does and its risk profile
- [ ] Handling for expired/invalid tokens (prompt re-link, don't retry-loop)

## Phase 4 — Polish / stretch

- [ ] **"My collection" / owned-skins view** — deferred, not yet designed. Needs its own scoping pass before building: it requires reading a linked account's actual *inventory*, a different Riot endpoint than the shop-checking one, with its own data-minimization question (`RISKS.md`'s current stance only covers fetching shop contents, not inventory) — revisit `RISKS.md` when this gets picked up. Explicitly out of the loadout builder, which stays aspirational/ownership-agnostic regardless (`PRD.md`).
- [ ] Real VP prices from the authenticated Riot session (Phase 3), backfilling/replacing the tier-based estimates for skins that session exposes pricing for — see `ARCHITECTURE.md`
- [ ] Loadout image export (downloadable/postable image, distinct from the link-sharing already in Phase 1/2)
- [ ] Vibe-based onboarding + "match my vibe" loadout suggestions (see `PRD.md`)
- [ ] Night market tracking
- [ ] Bundle browsing
- [ ] Multiple linked accounts per user
- [ ] Rotation-odds / budgeting tools
