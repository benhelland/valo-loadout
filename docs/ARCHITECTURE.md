# Architecture

## High-level shape

```
[valorant-api.com]  --sync job-->  [our DB: skins cache]
                                          |
[browser] <--REST/RPC--> [app server] ---+---> [our DB: users, loadouts, wishlists]
                                          |
                                          +---> [store-check subsystem] <--Riot auth-->[Riot's servers]
                                                        |
                                                        v
                                                 [notification dispatch] --> [Discord bot DM]
```

Three subsystems, deliberately loosely coupled:

1. **Content layer** — skin/cosmetic catalog, synced from valorant-api.com. No user data, no auth. Changes on Riot's release cadence, not per-request, so it caches aggressively.
2. **App layer** — accounts, loadouts, wishlists. Standard CRUD. Knows nothing about Riot's internal APIs.
3. **Store-check subsystem** — the only part that touches Riot's unofficial endpoints. Isolated in its own module with its own error boundaries so the rest of the app degrades gracefully if it breaks or has to be disabled. See `RISKS.md` for why that isolation matters.

## Tech stack

Everything here runs on a free tier at this project's scale, with one paid line item (vibe-tagging LLM calls, ingest-time only).

| Concern | Choice | Why |
|---|---|---|
| **Language** | TypeScript everywhere | One language across frontend, API routes, and job scripts; shared types throughout. |
| **Frontend** | Next.js (React) | Good fit for an image/video-heavy UI; strong SSR/ISR story for a mostly-static gallery; one deploy target with the backend. |
| **Styling** | Tailwind CSS | Consistent UI without hand-rolling a design system. |
| **Backend** | Next.js route handlers + Server Actions | No separate service needed — the store-check subsystem is I/O-bound (a few HTTP calls per account per day). |
| **Database** | Postgres via **Neon** | Serverless Postgres that scales to zero; no compute charge while idle. |
| **ORM** | Prisma | Type-safe queries and migrations. |
| **Auth** | Auth.js (NextAuth), **Discord OAuth only** | No password handling of our own to secure; fits the audience; sessions in the same database. |
| **Hosting** | Vercel | Free at this scale, pairs naturally with Next.js. |
| **Job trigger** | Vercel Cron, with a GitHub Actions scheduled workflow as a fallback | The route does the real work (query due accounts, poll Riot, upsert sightings, dispatch notifications); the trigger just wakes it up. |
| **Images/video** | Direct URLs to valorant-api.com's CDN via Next's image optimization | Never re-hosted, so no object-storage bill — and it's the good-citizen behavior `RISKS.md` commits to. |
| **Color extraction** | `node-vibrant`, server-side during sync | Pure compute, no external API. |
| **Vibe tagging** | A vision-capable LLM, ingest-time only | The one recurring cost — small, because it runs at Riot's release cadence, not per request. |
| **Notifications** | A Discord bot DMing the user directly — **not** a per-user webhook | Satisfies the requirement that notifications work automatically after signup + Riot-link, with no extra setup step. Behind a `channel` abstraction so email/push can be added later without touching detection/dedup. |
| **Secrets** | Env vars + Node's `crypto` (AES-256-GCM) for linked-account tokens, keyed by `RIOT_TOKEN_ENCRYPTION_KEY` | No separate secrets service needed at this scale. |

**Why one relational database rather than Postgres + Mongo/Redis:** every table here has real structure and real relationships to enforce (a `loadout_item` must point at a `skin` that exists; gallery filtering combines weapon, tier, color and vibe in one query). The data volume (~15–20k catalog rows) never approaches where NoSQL's tradeoffs would pay for themselves, and a second datastore means operating two services for a data shape that doesn't need the split. Revisit only against a real bottleneck.

## Auth (Discord OAuth)

`getCurrentUserId()` (`src/lib/auth.ts`) reads an Auth.js v5 session and either returns the signed-in user's id or redirects to `/sign-in`. Every query and action goes through it, so it is the single swap point for auth.

- **Split config, two files.** `src/auth.config.ts` holds only `pages`/`callbacks.authorized` — no `PrismaAdapter`, no Discord secret. `src/auth.ts` spreads that and adds the real adapter/provider/session config; only it is imported from Node contexts. `src/proxy.ts` imports the lightweight config only, so route protection is a JWT-cookie check with no DB round-trip per navigation.
- **Session strategy is explicitly `"jwt"`.** Passing an adapter makes Auth.js default to `"database"` sessions, which requires a `Session` model this schema deliberately doesn't have. Leaving it to default breaks every sign-in.
- **`User` needs an `emailVerified` column** even with no email provider configured — Auth.js's OAuth login path writes it unconditionally.
- **Route protection is layered, not single-point.** `src/proxy.ts` gates `/loadouts/:path*` and `/account/:path*` and redirects to `/sign-in?callbackUrl=<path>` before a page or action runs (Server Actions are POSTs to the page's own route, so a matcher covering the page covers its actions). `getCurrentUserId()` independently re-checks — defense in depth, so a call site added outside the matcher still fails closed.
- **`callbackUrl` is an absolute URL, not a path.** Auth.js builds it that way, and `safeReturnTo()` (`src/lib/safeReturnTo.ts`, shared with the buddy picker) accepts only relative paths by design. `/sign-in` therefore strips any `callbackUrl` down to pathname+search — parsing against a throwaway base discards any origin, real or attacker-supplied — before running it through the unmodified validator.
- **Discord OAuth credentials are never persisted.** `src/lib/authAdapter.ts` wraps `PrismaAdapter` to strip `refresh_token`/`access_token`/`id_token`/`session_state` before the `accounts` row is written. Nothing in this app ever reads them back (see "Notifications subsystem" for why the sign-in event's in-memory token is used instead), so storing them is downside with no benefit. `type`/`provider`/`providerAccountId`/`scope`/`expires_at`/`token_type` are kept — none is a credential.
- **Next.js 16 renamed `middleware.ts` → `proxy.ts`** (same mechanism). Next's build-time check doesn't see through `export const { auth: proxy } = NextAuth(...)` destructuring — it needs a separately-named `export const proxy = ...`. Note `proxy` defaults to the Node.js runtime as of v16.

## Data model

- `users` — id, email, auth info, created_at
- `linked_riot_accounts` — id, user_id, encrypted OAuth refresh token (never a password), region/shard, last_synced_at, next_poll_at (derived from the account's own shop reset time, not a blind interval), status (active/expired/error/captcha_blocked), refresh_locked_until, expiry_notified_at, puuid, riotGameName/riotTagLine (so a user can confirm *which* account got linked), lastError
- `skins` — id (uuid from valorant-api.com), weapon, name, tier (`contentTierUuid`), collection (`themeUuid`), display_icon_url, price_vp (harvested from storefront responses — see "Pricing"; null when never observed), first_seen_in_sync_at, color_family. No `video_url`/`release_date` columns: video lives on levels/chromas individually, and valorant-api.com has no release-date field at all.
- `skin_levels` — id, skin_id, level_index, display_icon_url (nullable), video_url (nullable — most levels have none), levelItem (a raw enum like `EEquippableSkinLevelItem::SoundEffects`)
- `skin_chromas` — id, skin_id, chroma_index, display_icon_url, swatch_color (nullable — the base chroma usually has no swatch image; extraction falls back to `fullRender`/`displayIcon`), color_family (per-chroma, so a color filter can match any variant), video_url (nullable)
  - `chroma_index` preserves valorant-api's own array order. Index 0 is always the base color. Without an explicit order a query returns chromas in unspecified order, and code assuming "chromas[0] is the default" silently picks a recolor.
- `skin_vibe_tags` — skin_id, tag; many-to-many, assigned at sync time
- `buddies` / `buddy_levels` — id, name, display_icon_url, charm_level; buddies have their own level progression, no video
- `loadouts` — id, user_id, name, created_at, is_shareable, share_slug (nullable, unguessable, regenerated on revoke)
- `loadout_items` — loadout_id, weapon_slot, skin_id, level_id, chroma_id, buddy_id
- `wishlist_items` — user_id, skin_id, added_at
- `skin_sighting_stats` — linked_riot_account_id, skin_id, first_seen_at, last_seen_at, times_seen. One row per (account, skin) ever seen, upserted on every poll for every skin observed — not just wishlist matches. Bounded by catalog size rather than by time, so it grows to a ceiling and stops, unlike a per-day log. Powers "last seen N days ago."
- `notifications_sent` — id, user_id, skin_id, channel, sent_at. Dedupe for wishlist-match DMs via a rolling ~20h window. The expiry-warning DM dedupes separately via `expiry_notified_at`, since it isn't about a skin.
- `environment_marker` — a single row holding the literal word `"development"` or `"production"`. See "Environment self-check".

## Store-check subsystem

This is the part that carries actual risk (see `RISKS.md`).

**Password login is not available.** `PUT https://auth.riotgames.com/api/v1/authorization` requires an **hCaptcha token** as a mandatory field of `riot_identity`, so it is CAPTCHA-gated for every account. Obtaining that token programmatically means defeating bot detection, which is out of bounds here. As a consequence there is no 2FA challenge to handle either — we never submit a password.

**What's built instead: OAuth 2.0 authorization code.** The app never receives a password.

1. `buildAuthorizeUrl()` → `GET https://auth.riotgames.com/authorize` with `client_id=riot-client`, `response_type=code`, `redirect_uri=http://localhost/redirect`, `scope=openid link ban lol_region account offline_access`. The user signs in on **Riot's own page**. `offline_access` is what yields a refresh token — without it this silently regresses to short-lived links.
2. They land on a dead `http://localhost/redirect?code=…` (nothing listens there; its only job is to put the code in the address bar) and paste that address back. `extractAuthorizationCode` (`src/riot/oauth.ts`) accepts a full URL or a bare code and constrains it to a URL-safe token set. Note authorization codes are *padded* base64, so `=` must be in that set.
3. `POST https://auth.riotgames.com/token` — **form-encoded, not JSON** — with `grant_type=authorization_code` → access token, id token, refresh token. Later polls use `grant_type=refresh_token`. An `error: "invalid_grant"` response is the definitive "this credential is dead" signal → status `EXPIRED`, never retried.
4. Then: `GET /userinfo` (puuid + game name/tag line), `POST entitlements.auth.riotgames.com/api/token/v1`, and `PUT riot-geo.pas.si.riotgames.com/pas/v1/product/valorant` with the id_token (→ `affinities.live`, the shard the storefront is addressed by).
5. `POST https://pd.{shard}.a.pvp.net/store/v3/storefront/{puuid}` with an empty JSON body. **v3 and POST** — the community docs still document a `GET v2` that no longer works. Read fields are `SkinsPanelLayout.SingleItemOffers` and `…RemainingDurationInSeconds` and nothing else; bundles, night market, accessories and Radianite offers are deliberately ignored.
6. `SingleItemOffers` are **skin *level* UUIDs, not skin UUIDs** — mapped via `skin_levels`. Unmapped ids are skipped rather than fatal (a brand-new skin just means the catalog sync hasn't run since it shipped).
7. Only the refresh token is persisted, AES-256-GCM encrypted (`src/lib/crypto.ts`). Access and entitlements tokens are minted fresh per poll and discarded.

**Refresh-token rotation is a correctness hazard.** Riot issues a new refresh token on every use and invalidates the old one, so two overlapping refreshes — a cron run and a user clicking "check shop now", or two cron invocations — each invalidate the other's token and permanently break the link. `refreshLockedUntil` plus a conditional `updateMany` is atomic in Postgres: exactly one caller transitions the row unlocked→locked, everyone else gets zero rows back and skips. The lease is reclaimable once stale, so an interrupted run can't wedge an account. The rotated token is persisted *before* any work depending on it, so a later failure can't lose the only token that still works.

**CAPTCHA / hard-block handling.** `src/riot/http.ts` detects Cloudflare's `403` + `x-frame-options: SAMEORIGIN` signature (and treats `429` the same way), raising `RiotError("BLOCKED")` → status `CAPTCHA_BLOCKED`, surfaced plainly and **never retried**. Explicitly not implemented, and not to be added without revisiting `RISKS.md`: proxy rotation, TLS-fingerprint spoofing, CAPTCHA solving.

**Where the poller runs is an open question, so the trigger is pluggable.** Cloudflare is hardest on datacenter IPs, which is what both Vercel Cron and GitHub Actions are. Two interchangeable triggers wrap the same `runDueShopChecks()`: `GET /api/cron/check-shops` (Bearer `CRON_SECRET`, constant-time compare, fails closed with 503 if unconfigured) and `npm run check-shops` (runs anywhere, including a residential connection). Running the job somewhere it isn't blocked is not evasion; rotating IPs to dodge a block would be.

**Vercel Cron is not currently used, and its free tier can't serve this job.** Hobby accounts accept only once-per-day schedules — an hourly expression is rejected at deploy time, so there is no `vercel.json` cron block. Once daily is not merely coarse here, it's insufficient: each account's `nextPollAt` derives from that account's own shop reset, and resets are spread across the day, so a single fixed daily trigger would check an account up to ~23 hours late, often after its shop had already rotated again. The remaining options are a scheduled GitHub Actions workflow hitting the cron route (free, finer granularity, still a datacenter IP) or `npm run check-shops` on a machine that isn't blocked. Until the datacenter-IP question is answered, the local script is the known-good path, and the `/account` page's "check shop now" control covers the manual case.

**Rate limiting** (`src/riot/http.ts`): every outbound Riot call goes through one `riotFetch()`, so the guards can't be bypassed by a new call site. A 250ms minimum interval serialises bursts, and a per-process cap of 500 calls is a circuit breaker for the runaway-loop case. Both are per-process, so on serverless each cold start gets a fresh budget — the real cadence control is `nextPollAt` in the database.

**Polling cadence:** one poll per account per day. The shop resets once daily, so there is nothing to gain from checking more often. The storefront response includes when that account's shop next resets; that becomes `next_poll_at`, jittered up to 30 minutes per account so accounts don't sync up. A failed poll gets a bounded retry with backoff later the same day — an exception path, not the routine cadence.

**Never logging credentials is structural, not conventional.** Riot's reauth `Location` header contains the access token in its URL *fragment*, so `redactUrl()` strips everything but origin+path, and `recordFailure` persists only messages this codebase authored — never an upstream error body.

**Data minimization:** fetch and store only what's needed to detect wishlist matches and update `skin_sighting_stats`, never a full account or inventory dump.

## Pricing

No public source exposes VALORANT prices, and Riot has withdrawn the bulk price endpoint: `GET /store/v1/offers/` 404s at v1–v5 while `GET /store/v1/wallet/{puuid}` still works, so it was removed rather than re-versioned. There is no bulk price load available.

**Prices accrue from responses the app already fetches.** `fetchDailyShop` returns every VP cost in the storefront payload — the four daily offers (`SkinsPanelLayout.SingleItemStoreOffers`) and every item in the featured bundles (`FeaturedBundle.Bundle/Bundles[].ItemOffers`). `recordObservedPrices` maps those to skins and writes `skins.price_vp`. This costs zero extra Riot calls, and coverage grows as the store rotates.

- Offers key on **`Rewards[0].ItemID`**, the skin level uuid.
- A skin takes the **lowest** observed level price — that's the "buy this skin" cost, since higher levels are Radianite upgrades rather than separate VP purchases.
- Price recording is best-effort and runs *after* the shop check's own writes. Failing to store a price must never fail a shop check.

**Estimates are derived from observations, not hardcoded** (`src/lib/pricing.ts`). Real prices are grouped by (tier, is-melee); a group may price unobserved skins only if its observations span at least two **distinct themes** and all agree. Distinct themes rather than a raw count, because Riot sets prices per bundle — a 47-skin capsule haul is one price decision, not 47 independent data points.

- **A tier is not necessarily a price point.** "Exclusive" is what Riot uses for one-off and bundle-special skins, and real observations disagree with each other (2,175 and 2,375 seen on the same day). Melee sits on a different scale entirely and is not a fixed multiple of the gun price.
- **Disagreement becomes a range, not a mean.** Exclusive guns render as `~2,175–2,375 VP`. Every figure in a range is one Riot has actually charged. Ranges need the same two-distinct-theme corroboration as exact estimates, and totals built from them widen into ranges rather than collapsing to a midpoint.
- **A narrow launch seed covers the standard gun ladder** (Select 875 / Deluxe 1275 / Premium 1775 / Ultra 2475) so a cold start isn't blank. It deliberately excludes Exclusive and melee, and a group drops its seed the moment real data contradicts it or proves the tier non-uniform — so it decays into measured data rather than persisting as a permanent guess.
- **Totals carry counts of actual/estimate/unknown**, rendering as e.g. "8,200 VP est. + 3 unpriced". A bare `price ?? 0` sum counts an unpriced skin as free, so a loadout of five knives totals 0 VP while looking authoritative.
- **"Unknown" does not mean "not sold for VP."** With the catalogue endpoint gone there's no way to distinguish "unpurchasable" from "not observed yet", and most unknowns are ordinary on-sale skins.

## Environment self-check (startup)

Dev and production share no infrastructure — each environment is just a different `DATABASE_URL`/`DIRECT_URL` pair, set in a different place. So the only realistic way to mix them is a connection string copy-pasted into the wrong place, which no amount of structure prevents.

`src/lib/verifyEnvironment.ts`, run once per process from `src/instrumentation.ts` (Next.js's startup hook), catches that at boot:

- The `environment_marker` table holds a single row containing nothing but the literal word `"development"` or `"production"`, planted once per database via `src/scripts/setEnvironmentMarker.ts`. It deliberately holds nothing else — no hostname, no project id, nothing that would turn a log line into something worth hiding.
- At startup that word is compared against the deployment's own environment — `VERCEL_ENV` where it exists, falling back to `NODE_ENV` locally. Both are set by tooling and never typed into an env file, so neither can be copy-paste-mismatched the way `DATABASE_URL` can.
- **`NODE_ENV` alone is not sufficient on Vercel**, which sets it to `production` for preview deployments as well as real ones. `VERCEL_ENV` is what separates `production` / `preview` / `development`. Only `production` expects the production marker; previews expect the development one, matching the branching model where every non-`main` branch deploys as a preview against the dev database.
- That mapping means the check catches the mistake in **both** directions: a production deployment wired to the dev database, and — more dangerously — a preview branch wired to the production database, where a feature branch would write to real user data.
- The two signals are independent, which is what makes this a real check rather than a circular one: the marker lives *in* the database, so it travels with whichever database `DATABASE_URL` actually resolves to. A wrong connection string still reads back that database's own true answer.
- On mismatch the process throws during startup. Refusing to boot is the correct consequence — no request should be served against the wrong database. A missing marker warns rather than throws, so a fresh database isn't a chicken-and-egg problem.

**What it can log, by construction:** the literal words `"development"`/`"production"`, and nothing else. The module never reads `DATABASE_URL`, so no code path can leak a hostname or credential. `src/lib/verifyEnvironment.test.ts` asserts that property by checking every logged string for URL and hostname shapes.

## Notifications subsystem

Delivery is a **Discord bot DM**, not a per-user webhook. A webhook URL is a manual setup step — the user has to go create one — which conflicts with the requirement that notifications work automatically once someone has signed in with Discord and linked a Riot account. Don't reintroduce a webhook field as "simpler"; it doesn't meet the bar.

**A bot cannot open a DM with a user it shares no guild with.** There is no way around this with just a user id, which is what makes the guild-join step load-bearing rather than incidental:

- Every Discord sign-in requests the `guilds.join` scope alongside the defaults and adds the user to this app's own server via `PUT /guilds/{guild.id}/members/{user.id}`, `Authorization: Bot <DISCORD_BOT_TOKEN>`, body `{ access_token: <the user's guilds.join-scoped token> }`. Requires the bot to hold `CREATE_INSTANT_INVITE`. 201 = newly added, 204 = already a member; both are success. One extra line on Discord's own consent screen, no separate step for the user.
- **The access token has to be the one from *this* sign-in, not the `accounts` table.** `adapter.linkAccount` — which is what writes `accounts.access_token` — is only called the first time an account is created. A returning user's sign-in still runs the full OAuth exchange and gets a fresh token, but it is only handed to the in-memory `events.signIn({ account })` callback, never persisted. `src/auth.ts` uses `account.access_token` from that event. (This app also strips those columns entirely — see "Auth" above.)
- Idempotent and self-healing: a user who leaves the server is silently re-added on their next login.
- **Never blocks sign-in.** The call site wraps in `.catch(() => {})`, and `joinGuild`/`sendDirectMessage` (`src/discord/bot.ts`) never throw internally — they log and return. A Discord outage, an unconfigured token, or a 403 are all just "notification didn't go out," never an application error. Without `DISCORD_BOT_TOKEN`/`DISCORD_GUILD_ID` they no-op.

**Wishlist-match dispatch** (`notifyWishlistMatches`, `src/notifications/index.ts`) is called at the end of `runShopCheck`, after that check's own data is durably persisted — a Discord failure must never turn a successful shop read into a reported failure. It cross-references the shop's skin ids against `wishlist_items`, dedupes against `notifications_sent` within a rolling ~20h window, and batches every new match into a single DM rather than one per skin.

**Expiry warning** (`notifyRiotLinkExpired`) fires reactively from `recordFailure` the moment a refresh fails with `EXPIRED`, guarded by `expiry_notified_at` so repeated failed polls don't re-send. Cleared on every successful (re)link. Deliberately **not** pre-emptive: Riot's rotating refresh token has no documented TTL, so there is no reliable signal for an "about to expire" warning — guessing at one would just produce a wrong deadline.

## Skin/animation assets

valorant-api.com covers weapons, skins, chromas, levels, buddies, content tiers, themes and bundles, with image assets per item. Video (`streamedVideo`) lives on individual levels and chromas rather than one field per skin, and is frequently absent. It's an unofficial, unversioned API — re-verify the schema before building against it. Cache what's needed (image and video URLs, keyed by id) rather than hitting it per page load; it's a shared community resource.

**Two things it does not have:**

- **No VP price data**, anywhere — not on skins, bundles, or weapons, and there is no prices/offers endpoint. See "Pricing" for what fills the gap.
- **No release date**, anywhere. `first_seen_in_sync_at` records when the sync job first encountered a skin id. That's accurate going forward but is **not** a release date for the launch catalog, whose rows all land within a single 15-second backfill window.
  - **There is therefore no "sort by newest".** A sort has to order the whole catalog to mean anything, and this column can't. `buildOrderBy` falls back to the rarity default for any unrecognised `?sort=` value, so old links degrade rather than break.
  - **What could replace the intent:** a "New" badge or filter on skins first seen within the last N days. That only has to be right about genuinely-new skins, which is exactly what this column supports, and correctly never matches the backfill. Not built yet — there's nothing to surface until the sync job has been running against live content for a while.
  - **If real release dates are ever wanted:** the unit is `themeId`, not the skin, and themes are already per-*release* rather than per-franchise. "Reaver" is three distinct theme UUIDs, and Riot's own `assetPath` disambiguates them (`SoulStealer` → `Soulstealer2` → `Soulstealer3`), so re-releases can be ordered without guessing. 239 of 441 themes are bundle-shaped and cover ~83% of browsable skins, so a curated `theme_id -> released_on` seed of ~239 rows would do most of the job. The dates exist only in editorial tables, not as a structured dataset, and `assetPath` isn't currently synced. Deferred: it's a hand-curated dataset with ongoing per-release maintenance, for a sort nothing depends on.

**Missing images and videos are upstream gaps, not sync failures.** Every null
in our catalog was checked field-by-field against the live API: in all cases the
value is null upstream too, and no row exists upstream that we failed to store
(1,405 skins / 2,677 levels / 2,921 chromas, matching exactly). Re-running the
sync will not fill any of these in.

| field | null | share |
|---|---|---|
| `skins.displayIconUrl` | 47 | 3% |
| `skin_levels.displayIconUrl` | 767 | 29% |
| `skin_levels.videoUrl` | 837 | 31% |
| `skin_chromas.displayIconUrl` | 227 | 8% |
| `skin_chromas.swatchUrl` | 862 | 30% |
| `skin_chromas.videoUrl` | 2,056 | 70% |
| `skin_chromas.fullRenderUrl`, buddies, buddy levels | 0 | — |

The two that look alarming are not. `fullRenderUrl` is populated on every
chroma, which is why no skin is unrenderable: all 47 skins lacking their own
icon still resolve an image through the level/chroma fallback chain, and the
gallery's fallback ordering exists precisely for this. And most chromas having
no video is expected rather than missing data - a recolor usually has no
dedicated clip because the per-level videos already cover that colour, which is
why the detail page falls through to the active level's video.

**No 3D model data exists in any legitimate source.** A drag/rotate inspect view was considered and declined for that reason — see `RISKS.md`. Presentation stays 2D/video.

## Gallery

**Filter bar** (`FilterBar.tsx`): every control applies immediately on change via `router.replace` — no Apply button. State lives entirely in the URL, so results stay server-rendered, shareable and bookmarkable; only the controls are client-interactive, not the results grid. Any filter change resets `page` to 1.

The search field pairs debounced auto-apply with a predictive dropdown (`SearchAutocomplete.tsx` + `searchSkinsAutocomplete`) — a small unpaginated lookup for jumping straight to one skin, distinct from the full-catalog filtered grid the same text drives. Both run through one shared subsequence scorer (`src/lib/fuzzyMatch.ts`), so they stay consistent: "eldervndl" surfaces "Elderflame Vandal" in both.

The grid's fuzzy path (`listSkins` in `src/queries/gallery.ts`) can't rank in SQL, so when search text is present it fetches every skin matching the other filters, scores and sorts in JS, and paginates the ranked array. That's a real behavior split from the no-search path, which stays a single indexed SQL query — acceptable at this catalog size. The loadout picker reuses both, scoped to a locked weapon via an optional `weaponId`.

The search box's text is local state in `FilterBar`, deliberately not resynced from the URL after mount. Round-tripping a `defaultValue` back down through the same debounced `router.replace` races: a slower older keystroke's response lands after a newer one and stomps text the user has already typed past. Local ownership removes the race rather than trying to out-clever it. "Clear" is a plain `<a>`, not a soft navigation, so every control resets to its true default via a full page load.

**URL params are validated before they reach Prisma** (`src/lib/filterParams.ts`): ids must be UUID-shaped or one of our own synthetic collection-group ids, color and vibe must be in their existing vocabularies, free-text search is stripped of control characters and length-capped, and page size is checked against an allowlist. Not an injection concern — Prisma parameterises — but Postgres rejects NUL bytes outright, so an unvalidated param is a 500 rather than a graceful miss. Malformed filters fail soft to an unfiltered view, which is almost always a mangled link rather than an attack.

**Color filter shows the chroma that actually matched.** A match can come from any chroma, so filtering by "green" would otherwise render a card's base look even when green only exists on some recolor. `listSkins` fetches each skin's full chroma list; `SkinCard` takes a `matchColor` prop and, only when the base chroma isn't the one that matched, swaps in that chroma's image and links with `?chromaId=…`. Color-only by design: vibe tags are per-skin, not per-chroma.

**Collection grouping** (`src/lib/collectionGroups.ts`). valorant-api.com models each drop as its own theme, which makes the raw collection list unusable:

- **Esports capsules** — 142 VCT team capsules across 56 names, one skin each. Listed individually they were a third of the dropdown while accounting for 10% of the catalog. VCT and Champions each collapse to a single option, kept *separate* deliberately: both are esports, but VCT capsules are near-identical team sidearms while Champions is five two-piece collections holding some of the game's most sought-after skins.
- **Re-releases** — Riot re-releases a collection as a genuinely new theme with an identical display name rather than versioning the original, so "Reaver" is three disjoint skin lineups all named "Reaver". Any display name shared by more than one theme collapses automatically, with no hardcoded list, so a future re-release needs no code change. A name appearing once is untouched.

Both are browse-time grouping only — no rows are merged, a skin's detail page still shows its real collection, and individual drops stay reachable through search. The dropdown's membership rule and the query's selection rule derive from one shared definition, with a test asserting they agree, so an option can't drift into filtering something other than what it hides.

**Default sort is rarity (highest first).** Sort options are rarity, price and alphabetical — all exact functions of data we actually have.

**Performance:** the catalog is large enough (1500+ skins, plus levels and chromas as separate rows) that the grid is never rendered whole. Pagination caps a page at 192 skins / 384 buddies (`src/lib/pageSize.ts`), and cards use `next/image`, which lazy-loads below the fold — together that removes the need for a virtualized grid at this catalog size. Video never autoplays across a grid; it loads on opening the detail view, both for user bandwidth and to avoid hammering the upstream CDN.

## Buddies

**Pairing:** buddies show as a small circular badge on the preview frame, mirroring how Riot's own store UI pairs a buddy with a skin. An earlier approach composited the buddy icon onto the weapon's flat render at a per-weapon anchor point; it read as a sticker pasted on a photo, which is an inherent ceiling of gluing two flat, mismatched-perspective images together rather than an anchor-tuning problem. That version is in git history if a future pass wants to revisit an on-weapon composite with rotation, drop-shadow and a strap line.

**Buddy gallery (`/buddies`):** a denser browse grid than the skin gallery, since buddy icons are small and low-res, with matching fuzzy search and color filter. No per-buddy detail page — there's nothing more to show than the name and icon already on the card. Reachable via a secondary tab pair on both `/` and `/buddies`, deliberately not promoted into the main nav.

It doubles as the buddy picker. "Browse all buddies" from a skin enters *pick mode*: the gallery takes a `returnTo` path plus the in-progress `levelId`/`chromaId` (client-only state that would otherwise be lost on the round trip), cards become real links, and choosing one returns to exactly where the user came from with `buddyId` applied. Works unchanged from the loadout builder. `returnTo` is attacker-controllable, so it's validated as a same-origin relative path (`src/lib/safeReturnTo.ts`) — an unchecked value here is an open redirect. In plain browse mode cards render inert, because a hover state on something unclickable reads as broken.

**Buddy color extraction excludes the shared keychain clasp.** Every buddy icon hangs from an identical rendered brass clasp that isn't part of any charm's design, and it dominated 52% of the catalog as "orange". It can't be cropped out — charm size and hang vary too much for a fixed position — but it has a consistent signature: swatches at hue 15–55° and lightness 10–75% appear on up to 49% of buddies regardless of the charm's real color, always at a tiny population share, because the clasp is thin and mostly hidden.

`extractBuddyColorFamily` (separate from the skin/chroma path, which doesn't have this problem) uses that population gap: pick the best non-hardware-band swatch, and if it holds a meaningful share of the image (≥12%) classify from non-hardware swatches only; otherwise trust the hardware-band swatches, since the charm plausibly really is gold. A simpler "does the hardware band dominate the palette" rule scores worse — the clasp's color routinely splits across three or four of Vibrant's six swatch slots, so it can out-total a charm's single real swatch by count while being visually tiny. Known remaining gap: the episodic "Gold"/"Silver" reward buddies, solid metallic orbs where a dark background-vignette swatch sometimes wins. Left alone as a small, specific family rather than a catalog-wide problem.

## Loadouts

The board (`LoadoutBoard.tsx`) is a 4-column grid grouped by category (`BOARD_COLUMN_GROUPS` in `src/lib/weaponOrder.ts`: Sidearms | SMGs+Shotguns | Rifles+Melee | Snipers+Heavy), every slot visible at once, buddy shown as an icon docked beside the weapon render.

Clicking a filled tile pops up a "View / Replace" choice: View builds a `/combo/:encoded` link from that slot's exact skinId/levelId/chromaId/buddyId, so it shows the picked variant rather than the skin's defaults. Clicking an empty tile goes straight to the picker.

**Picker and assignment reuse the gallery itself.** The picker (`/loadouts/[id]/weapon/[weaponId]`) reuses `FilterBar`/`SkinCard`/`Pagination` with the weapon filter hidden, and assignment (`…/skins/[skinId]`) reuses the skin detail page verbatim with a `loadoutContext` prop that adds an "Add to Loadout" action. Net-new code is the board and the mutations, not a parallel UI. The assignment page pre-fills level/chroma/buddy from the slot's existing item when it already holds that skin, so re-opening a slot to tweak the buddy doesn't lose the rest.

"Add to Loadout" is also offered directly from the gallery's skin detail page, inferring the weapon slot from the skin — otherwise finding a skin while browsing means abandoning the page and navigating back through the board.

**The buddy badge** (`DraggableBuddyBadge.tsx`) is draggable and resizable within the media frame on the Image tab (48–180px, position clamped so it stays fully inside regardless of size), built on native Pointer Events so mouse, touch and pen behave identically. On the Animation tab it snaps to a fixed default and stops being interactive — dragging over playing video is a distraction. Position and size are plain component state, deliberately not persisted anywhere, so leaving and returning always starts from the default.

Its chrome (backing circle and resize grip) fades to transparent ~1.5s after appearing, leaving just the icon. Grabbing it reveals the chrome and holds it for the duration of the drag, then restarts the countdown. The timer is ref-gated rather than naively restarted, so a fade already ticking before a grab can't fire mid-drag.

## Sharing

Both link types are read-only, need no viewer login, and stay entirely inside the app and content layers — no Riot interaction, no new risk profile.

- **Loadout links** (`/l/:share_slug`): opt-in per loadout, private by default. The slug is 16 random bytes (base64url), deliberately distinct from the loadout's internal id, so revoking clears the slug and genuinely kills links already in the wild without touching the loadout. The public page takes no user id and renders its own read-only markup rather than reusing `LoadoutBoard`, which exists to drive mutations a viewer must never be offered. It renders live state; no snapshot system for v1.
- **Combo links** (`/combo/:encoded`): fully stateless — the skin/level/chroma/buddy ids packed into the URL itself, no database row, nothing to revoke. `decodeCombo` validates every decoded id against a UUID shape and rejects a token whose field count is wrong. Base64 decoding is **not** validation: `Buffer.from(x, "base64")` silently ignores invalid characters rather than throwing, so a surrounding try/catch never fires for junk input — it just produces arbitrary bytes that reach a database lookup. Without the explicit check a garbled link 500s instead of 404ing.
- **Share as image**: renders `LoadoutShareImage.tsx` (a fixed-1200px presentation-only template, not a screenshot of the live board with its nav and buttons) off-screen, rasterises with `html-to-image` at 2x, copies the PNG to the clipboard and offers a download. Clipboard *image* writes are unsupported in some browsers and blocked outside a secure context, so that step is wrapped separately — a failure there still leaves a working download.

## Color and vibe tagging

Runs as part of the sync job, per new skin/chroma only.

**Color** — a dominant-color bucket extracted from each skin's and chroma's display image via `node-vibrant`. Deterministic, no external API, cheap to re-run.

- Classification is **population-weighted**. Picking whichever Vibrant-named swatch is non-null first ignores how much of the image it actually represents, and Vibrant synthesizes zero-population placeholder swatches that then win on priority order alone. Those are filtered out first.
- **Lightness thresholds are set from the catalog's real distribution.** Across desaturated results, the darkest swatch bottoms out around l=21% and the lightest tops out around l=81%, with natural valleys at ~35% and ~65%. Thresholds outside that range are dead zones that return literally zero results.
- `classifyHsl` is shared with buddy classification, so re-tuning it requires re-validating both.

**Vibe** — each skin's showcase image goes to Claude Haiku 4.5 (`src/lib/vibeTagging.ts`) once at sync time for 1–4 tags from a fixed 14-word vocabulary (dark, sleek, futuristic, elegant, aggressive, cute, retro, neon, anime, nature, gold, minimal, tactical, cosmic). Fixed vocabulary, not freeform, so filters stay consistent. Stored in `skin_vibe_tags`, never re-tagged per request — an ingest-time cost of maybe a few hundred calls a year.

- **The prompt is a bulleted per-tag glossary, not a bare word list.** Each call is independent with no memory of any other, so nothing keeps one call's idea of "sleek" consistent with another's unless the prompt pins each tag down itself. The structure matters, not just the wording: the same definitions written as one dense comma-joined sentence let `tactical` over-trigger on anything resembling a real gun silhouette, and an exclusion clause buried mid-sentence didn't hold. One line per tag separates `tactical` from `minimal` cleanly.
- **Oversized images are downscaled and retried.** At least one collection serves 8192px-wide renders, over Anthropic's 8000px per-dimension limit. `tagSkinVibe` catches that specific 400 and retries once with the image downscaled to 1568px (the documented sweet spot for image tokenization) and sent as base64.
- **Backfill** (`src/scripts/backfillVibeTags.ts`) is a standalone catch-up script, separate from the per-skin sync path. It only queries skins with zero tags, so it's safe to interrupt and re-run without re-spending. Each skin's tag-and-write has its own try/catch so one bad image can't reject a batch, plus one automatic retry pass.

Both are best-effort classification, not ground truth — fine for browse and filter, not something another feature should depend on for correctness.

## Per-user limits

Every ceiling on what one signed-in user can create or trigger lives in
`src/lib/limits.ts`, and each is enforced in the Server Action - the only
place a client cannot skip.

| Limit | Value | Why |
| --- | --- | --- |
| Loadouts per user | 25 | Bounds row growth. Checked on both create *and* duplicate; duplicate is a create too, and checking only one leaves the cap bypassable. |
| Wishlist items per user | 300 | The unique `(userId, skinId)` index already caps this at the catalog size; 300 is the tighter, more useful bound. Only counted when the row would be new, so re-toggling an existing entry still works at the cap. |
| Name length | 60 chars | A row cap bounds how *many* names exist but says nothing about how *big* one is. Applied via `normalizeName`, which also handles non-string input - Server Action arguments are deserialized from the client and are not runtime-checked by the type system. |
| Linked Riot accounts per user | 3 | More than a couple is indistinguishable from farming shop data. Applied to the create half of the upsert only, so re-linking to recover an expired token is never blocked by the limit. |
| Manual shop check | 5 min per account | See below. |

The manual shop-check cooldown is the one that isn't about storage. It is the
only path where a user action directly causes outbound Riot traffic, and each
run refreshes (and therefore rotates) the OAuth token as well as reading the
shop - so an unthrottled button is precisely the "aggressive polling" pattern
`RISKS.md` warns draws attention to unofficial integrations. A shop rotates
once a day, so a second check inside the window cannot return anything new.

The cooldown is stamped in `lastManualCheckAt` *before* the call, and is
deliberately not derived from `lastSyncedAt`: that column only moves on
success, which would leave the retry-after-failure path unthrottled - the case
most likely to be hammered, and the one most likely to already be hitting a
block.

Limits are returned as a result object rather than thrown. Next.js redacts a
thrown Server Action error's message in production, so a throw would reach the
user as an opaque "something went wrong" - useless for a limit, whose whole
value is saying which limit was hit and what to do about it.

## Security notes

- Encrypt linked-account tokens at rest; scope access to the store-check subsystem only.
- Never log raw credentials or tokens, including in error reporting.
- Rate-limit and monitor outbound calls to Riot so a bug can't become an accidental hammering incident. The user-triggerable path is capped per account - see "Per-user limits".
- The runtime `DATABASE_URL` uses a least-privilege role (SELECT/INSERT/UPDATE/DELETE only, no DDL). `DIRECT_URL`, used by the Prisma CLI for migrations, stays on the owner role. See `RISKS.md`.
