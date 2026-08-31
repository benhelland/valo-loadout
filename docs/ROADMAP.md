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

- [x] **Loadout builder built ahead of real auth, against a mock user** — explicit user call: build the feature first, wire up Discord OAuth after. Board layout (all weapon slots visible, grouped Sidearms→Melee like the real buy menu), picker reuses the gallery's own filter/search UI scoped to one weapon (`/loadouts/[id]/weapon/[weaponId]`), assignment reuses the skin detail page verbatim with an added "Add to Loadout" action (`/loadouts/[id]/weapon/[weaponId]/skins/[skinId]`) — matches `PRD.md`'s "feels like an extension of browsing, not a separate form". Multiple named loadouts, switcher dropdown, duplicate, rename, delete, running estimated VP total — all built and verified end-to-end in the browser (create → assign → clear → duplicate → switch → delete, mobile stacking, console clean). Buddies show as the same corner badge as the skin detail page, not composited onto the weapon (`PRD.md`/`ARCHITECTURE.md` corrected to match).
- [x] **User auth (our own accounts, not Riot's)** — real Auth.js v5 + Discord OAuth, `getCurrentUserId()` swapped over exactly as planned (see `ARCHITECTURE.md` "Auth (Discord OAuth)" for the full writeup: session strategy, route protection, the callbackUrl open-redirect fix, and two Prisma-adapter gotchas caught by reading the adapter's source before assuming the schema was compatible). Gallery/buddy browsing and public share/combo links stay open to anonymous visitors, verified in the browser; `/loadouts/*` and `/account/*` redirect to `/sign-in` and back. **Still needed from the user: a real Discord application (client ID/secret) - the code is done, this is the one external setup step left**, see the hand-off note in `ARCHITECTURE.md`.
- [x] Loadout share links (opt-in, revocable — see `ARCHITECTURE.md`) - shipped earlier, unaffected by the auth swap (ownership checks already went through `getCurrentUserId()`)
- [x] Wishlist: add/remove skins (heart toggle on gallery cards + a labeled button on the skin detail page, both optimistic), a dedicated `/wishlist` page, running estimated VP total - verified end-to-end in the browser (add from detail page, appears on `/wishlist` with correct VP total, remove from the grid without navigating away)

## Phase 3 — Riot account linking + store notifications

The riskiest and most differentiated piece — see `RISKS.md` before starting this phase.

**The Opus gate was honored** — this subsystem was written on Opus, after the model switch, as this file required.

- [x] **Riot auth flow (session token, password never persisted)** — built as **an OAuth 2.0 authorization-code flow, not password login**. The documented password flow turned out to be unbuildable: `PUT /api/v1/authorization` now requires an hCaptcha token, so it's CAPTCHA-gated for every account, always. We never receive a password at all, which honours "never store a raw Riot password" more strongly than the original design did. Full writeup in `ARCHITECTURE.md` → "Store-check subsystem detail". **`PRD.md`'s 2FA/code-entry requirement is moot as a result** — no password submission means no 2FA challenge to handle.
- [x] **Store-check subsystem: isolated module per `ARCHITECTURE.md`** — `src/riot/` (zero database imports: http/auth/oauth/store/errors) with `src/store-check/` as the only seam to Prisma. Nothing in the gallery, loadouts or sharing imports either, so disabling this feature means not calling into it.
- [x] **Scheduled polling** — `runDueShopChecks()` with two interchangeable triggers: `GET /api/cron/check-shops` (Bearer `CRON_SECRET`, constant-time compare, fails closed) and `npm run check-shops`. Pluggable on purpose: Cloudflare is hardest on datacenter IPs, which is what both Vercel Cron and GitHub Actions are. Verified end-to-end against the real database (auth rejects/accepts correctly, batch runs and reports).
- [x] **Handling for expired/invalid tokens (prompt re-link, don't retry-loop)** — typed `RiotError` kinds map onto the existing status enum: `EXPIRED` / `CAPTCHA_BLOCKED` clear `nextPollAt` entirely so they are never retried and wait for the user; only `UNAVAILABLE` (genuine transient) reschedules, at +1h.
- [x] `linked_riot_accounts`/`skin_sighting_stats`/`notifications_sent` schema — already existed; extended this pass with `puuid`, `riotGameName`/`riotTagLine` (so a user can confirm *which* account got linked — the only way to catch having linked the wrong account) and `lastError`.
- [x] Account-linking UI with plain-language disclosure — `/account` now has a working link form ("Sign in with Riot", then paste the redirect address, with step-by-step instructions), live status, "check shop now", the four most recently seen skins, and unlink. Disclosure updated: it now says we never see a password at all, because that's now literally true.
- [x] Clean unlink path (`unlinkRiotAccount`) — satisfies `RISKS.md`'s explicit requirement.
- [x] **Wishlist-match detection + notification dispatch** — built as a Discord **bot DM**, not the webhook originally sketched in `PRD.md`/schema (`discord_webhook_url` removed) — see `ARCHITECTURE.md` "Notifications subsystem detail" for why a webhook can't satisfy "automatic, no setup step" the way a bot-DM-plus-auto-guild-join can. `runShopCheck` calls `notifyWishlistMatches` after its own data is persisted; dedup is a rolling ~20h window over `notifications_sent`. Also added, beyond the original schema's scope: a reactive (not pre-emptive - no reliable signal exists for a rotating OAuth refresh token) "your Riot link expired" DM, guarded by `expiry_notified_at` so it fires once per expiry episode. **Not yet verified against a real Discord bot/server** - `DISCORD_BOT_TOKEN`/`DISCORD_GUILD_ID` need to be provisioned (see the hand-off note in `ARCHITECTURE.md`) before this can be tested end-to-end; until then `joinGuild`/`sendDirectMessage` no-op safely and the rest of the app is unaffected.
- [x] **Verified end-to-end against live Riot (2026-08-31).** A real account linked and returned its actual daily shop. Confirmed in order: authorization-code exchange → `/userinfo` (puuid + Riot ID) → entitlements token → riot-geo shard (`na`) → `POST /store/v3/storefront` → four offers, **all four resolving to catalog skins with zero unresolved ids** (which independently confirms the "offers are skin *level* UUIDs" assumption taken from SkinPeek). Refresh token stored encrypted; `nextPollAt` derived from Riot's own reset countdown. The **refresh-token grant** was then exercised separately — a second check rotated the token and persisted the new one (`refresh token rotated: true`), which is the path every subsequent poll uses and the one whose failure mode Ministral warned about. The refresh lock was verified to block a concurrent check and to be reclaimable once its lease expires, so an interrupted run can't wedge an account.
- [ ] **Still unverified: whether this works from a datacenter IP.** Every call so far has come from a residential connection. Cloudflare is hardest on datacenter IPs, which is what Vercel Cron and GitHub Actions both are. Until that's tested, `npm run check-shops` is the known-good trigger. Also untested: the real `EXPIRED` path (needs a genuinely aged-out token) and `CAPTCHA_BLOCKED`.

## Phase 4 — Polish / stretch

- [ ] **"My collection" / owned-skins view** — deferred, not yet designed. Needs its own scoping pass before building: it requires reading a linked account's actual *inventory*, a different Riot endpoint than the shop-checking one, with its own data-minimization question (`RISKS.md`'s current stance only covers fetching shop contents, not inventory) — revisit `RISKS.md` when this gets picked up. Explicitly out of the loadout builder, which stays aspirational/ownership-agnostic regardless (`PRD.md`).
- [ ] Real VP prices from the authenticated Riot session (Phase 3), backfilling/replacing the tier-based estimates for skins that session exposes pricing for — see `ARCHITECTURE.md`
- [ ] Loadout image export (downloadable/postable image, distinct from the link-sharing already in Phase 1/2)
- [ ] Vibe-based onboarding + "match my vibe" loadout suggestions (see `PRD.md`)
- [ ] Night market tracking
- [ ] Bundle browsing
- [ ] Multiple linked accounts per user
- [ ] Rotation-odds / budgeting tools
