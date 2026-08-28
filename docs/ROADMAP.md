# Roadmap

Phased so the riskiest, least-necessary-first piece (Riot account linking) comes after there's already something worth using without it.

## Phase 0 — Scoping (current)

- [x] Market research on existing tools
- [x] `CLAUDE.md` / `PRD.md` / `ARCHITECTURE.md` / `RISKS.md` written
- [ ] Confirm valorant-api.com's actual schema (skin fields, video availability) before designing the gallery UI around it
- [ ] Lock in stack choice (or confirm the `ARCHITECTURE.md` proposal)

## Phase 1 — Skin gallery (no accounts, no auth)

The whole "cool UI to look at all skins ever, all the animations" half of the idea, shippable entirely from valorant-api.com with zero account risk. Also doubles as the proving ground for the content-sync pipeline Phase 2+ will reuse.

- [ ] Sync job pulling skins/chromas/buddies from valorant-api.com into our DB
- [ ] Gallery UI: browse/filter by weapon, tier, collection; skin detail view with image + animation playback where available
- [ ] Deployed and usable as a standalone thing, even before any other feature exists

## Phase 2 — Accounts, loadouts, wishlist

Still no Riot integration — this is our own app's accounts.

- [ ] User auth (our own accounts, not Riot's)
- [ ] Loadout builder: assign a skin/chroma/buddy per weapon slot, save/edit named loadouts
- [ ] Wishlist: add/remove skins, running VP total
- [ ] Personal "my collection" view

## Phase 3 — Riot account linking + store notifications

The riskiest and most differentiated piece — see `RISKS.md` before starting this phase.

- [ ] Riot auth flow (login → session token, password never persisted)
- [ ] Store-check subsystem: scheduled polling per linked account, isolated module per `ARCHITECTURE.md`
- [ ] Wishlist-match detection + notification dispatch (start with one channel — email or Discord webhook)
- [ ] Account-linking UI with plain-language disclosure of what this does and its risk profile
- [ ] Handling for expired/invalid tokens (prompt re-link, don't retry-loop)

## Phase 4 — Polish / stretch

- [ ] Loadout sharing
- [ ] Night market tracking
- [ ] Bundle browsing
- [ ] Multiple linked accounts per user
- [ ] Rotation-odds / budgeting tools
