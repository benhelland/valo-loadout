# Roadmap

Phased so the riskiest, least-necessary piece (Riot account linking) comes after there's already something worth using without it.

## Phase 1 — Skin gallery

The "browse every skin and animation ever released" half of the idea, shippable entirely from valorant-api.com with zero account risk. Also the proving ground for the content-sync pipeline later phases reuse.

- [x] Sync job pulling skins/chromas/levels/buddies/themes/tiers from valorant-api.com
- [x] Color-family extraction as part of the sync job
- [x] AI vibe-tagging pass, backfilled across the catalog
- [x] Gallery: browse and filter by weapon, tier, collection, color, vibe, animation and search; sort; pagination
- [x] Skin detail view — image and video playback, level and chroma selectors, inline buddy preview
- [x] Fuzzy predictive search, auto-applying filters, active-filter chips, mobile filter collapse
- [x] Standalone `/buddies` gallery, doubling as the buddy picker
- [x] Stateless skin-combo share links (`/combo/:encoded`)
- [ ] Deployed and usable as a standalone thing, before any other feature exists

## Phase 2 — Accounts, loadouts, wishlist

Our own app's accounts. No Riot integration.

- [x] Loadout builder — board layout with every slot visible, picker reusing the gallery's own filter/search UI scoped to one weapon, assignment reusing the skin detail page with an added "Add to Loadout" action
- [x] Multiple named loadouts: switcher, duplicate, rename, delete, running VP total
- [x] User auth — Auth.js v5 + Discord OAuth. Gallery, buddy browsing and public share/combo links stay open to anonymous visitors; `/loadouts/*` and `/account/*` are gated
- [x] Loadout share links — opt-in, revocable
- [x] Wishlist — heart toggle on gallery cards, labeled button on the detail page, dedicated `/wishlist` page, running VP total
- [x] Cross-references between the three features — a skin's detail page shows which loadouts it's already in

## Phase 3 — Riot account linking + store notifications

The riskiest and most differentiated piece. Read `RISKS.md` before touching this phase.

- [x] Riot auth via OAuth 2.0 authorization code — no password, ever. See `ARCHITECTURE.md` → "Store-check subsystem"
- [x] Store-check subsystem isolated per `ARCHITECTURE.md` — `src/riot/` has zero database imports; `src/store-check/` is the only seam to Prisma. Nothing in the gallery, loadouts or sharing imports either
- [x] Scheduled polling — `runDueShopChecks()` behind two interchangeable triggers: `GET /api/cron/check-shops` (Bearer `CRON_SECRET`, constant-time compare, fails closed) and `npm run check-shops`
- [x] Expired/invalid token handling — `EXPIRED`/`CAPTCHA_BLOCKED` clear `nextPollAt` entirely and wait for the user; only genuine transients reschedule
- [x] Account-linking UI with plain-language disclosure, live status, "check shop now", recent sightings, and a clean unlink path
- [x] Wishlist-match detection and notification dispatch via Discord bot DM, plus a reactive "your Riot link expired" DM
- [x] Verified end-to-end against live Riot — a real account linked, returned its daily shop, all offers resolved to catalog skins, and the refresh-token grant plus rotation lock were exercised separately
- [ ] **Verify the Discord delivery path against a real bot and server.** Needs `DISCORD_BOT_TOKEN`/`DISCORD_GUILD_ID` provisioned first — see `LAUNCH_CHECKLIST.md`. Until then `joinGuild`/`sendDirectMessage` no-op safely
- [ ] **Determine whether the poller works from a datacenter IP.** Every call so far has come from a residential connection, and Cloudflare is hardest on datacenter IPs — which is what both Vercel Cron and GitHub Actions are. Until that's tested, `npm run check-shops` is the known-good trigger. The real `EXPIRED` and `CAPTCHA_BLOCKED` paths are also untested against live conditions

## Phase 4 — Polish and stretch

- [x] Real VP prices harvested from storefront responses, with derived estimates and honest ranges — see `ARCHITECTURE.md` → "Pricing"
- [x] Loadout image export
- [ ] **"My collection" / owned-skins view** — not yet designed. Needs its own scoping pass: it reads a linked account's *inventory*, a different Riot endpoint with its own data-minimization question that `RISKS.md`'s current stance doesn't cover. Explicitly out of the loadout builder, which stays aspirational and ownership-agnostic regardless
- [ ] "New" badge on recently-synced skins — the one part of the "what's new" intent the data genuinely supports (see `ARCHITECTURE.md` → "Skin/animation assets")
- [ ] Vibe-based onboarding and "match my vibe" loadout suggestions
- [ ] Night market tracking
- [ ] Bundle browsing
- [ ] Multiple linked accounts per user
- [ ] Rotation-odds and budgeting tools
