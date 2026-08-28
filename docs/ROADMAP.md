# Roadmap

Phased so the riskiest, least-necessary-first piece (Riot account linking) comes after there's already something worth using without it.

## Phase 0 — Scoping (current)

- [x] Market research on existing tools
- [x] `CLAUDE.md` / `PRD.md` / `ARCHITECTURE.md` / `RISKS.md` written
- [x] Confirm valorant-api.com's actual schema — see `ARCHITECTURE.md`. Two gaps found and resolved: no price data (static tier-based estimate) and no release date (our own `first_seen_in_sync_at`)
- [x] Lock in stack choice — see `ARCHITECTURE.md`

## Phase 1 — Skin gallery (no accounts, no auth)

The whole "cool UI to look at all skins ever, all the animations" half of the idea, shippable entirely from valorant-api.com with zero account risk. Also doubles as the proving ground for the content-sync pipeline Phase 2+ will reuse.

- [ ] Sync job pulling skins/chromas/buddies from valorant-api.com into our DB
- [ ] Color-family + AI vibe-tagging pass as part of the sync job (see `ARCHITECTURE.md`)
- [ ] Gallery UI: browse/filter by weapon, tier, collection, color, vibe; skin detail view with image + animation playback, level/chroma selectors, inline buddy preview
- [ ] Stateless skin-combo share links (`/combo/:encoded`) — no accounts needed, just catalog data, so this can ship in this phase
- [ ] Deployed and usable as a standalone thing, even before any other feature exists

## Phase 2 — Accounts, loadouts, wishlist

Still no Riot integration — this is our own app's accounts.

- [ ] User auth (our own accounts, not Riot's)
- [ ] Loadout builder: assign a skin/level/chroma/buddy per weapon slot, save/edit multiple named loadouts, switch between them
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
