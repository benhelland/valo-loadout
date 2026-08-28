# Architecture

The stack below is locked in (decided 2026-08-28, optimized for near-$0 cost at personal-project scale). Data model and subsystem design remain sketches to refine as building starts.

## High-level shape

```
[valorant-api.com]  --sync job-->  [our DB: skins cache]
                                          |
[browser] <--REST/RPC--> [app server] ---+---> [our DB: users, loadouts, wishlists]
                                          |
                                          +---> [store-check subsystem] <--Riot auth-->[Riot's servers]
                                                        |
                                                        v
                                                 [notification dispatch] --> [Discord webhook (v1); email/push later]
```

Three subsystems that should stay loosely coupled:

1. **Content layer** — skin/cosmetic catalog, synced from valorant-api.com. No user data, no auth. Could be static-generated or cached aggressively since it changes on Riot's release cadence, not per-request.
2. **App layer** — accounts, loadouts, wishlists. Standard CRUD web app. Doesn't need to know anything about Riot's internal APIs.
3. **Store-check subsystem** — the one part of this app that touches Riot's unofficial/internal endpoints. Keep this isolated (own module, own error boundaries) so the rest of the app degrades gracefully if this piece breaks or has to be disabled. See `RISKS.md` for why this isolation matters.

## Tech stack

Every piece below was picked to run on a free tier at this project's scale, with exactly one paid line item (vibe-tagging LLM calls, ingest-time only — a few dollars a year at most).

| Concern | Choice | Why |
|---|---|---|
| **Language** | TypeScript, everywhere (frontend, API routes, sync/job scripts) | One language across the whole app — no context-switching, shared types between frontend and backend. |
| **Frontend framework** | Next.js (React) | Strong fit for an image/video-heavy, animation-forward UI; good SSR/ISR story for the mostly-static skin gallery; one deploy target with the backend. |
| **Styling** | Tailwind CSS | Fast to build a polished, consistent UI without hand-rolling a design system. |
| **Backend** | Next.js API routes / route handlers | No separate service needed — the store-check subsystem is I/O-bound (a few HTTP calls per account per day), well within serverless function limits. |
| **Database** | Postgres via **Neon** | Serverless Postgres that scales to zero — no compute charge while idle, which fits bursty personal-project traffic. Free tier. |
| **ORM** | Prisma | Type-safe queries/migrations matching the TypeScript-everywhere choice; keeps the data model in `ARCHITECTURE.md` translatable directly into schema. |
| **Auth (our own accounts)** | Auth.js (NextAuth), **Discord OAuth only** | No password handling of our own to build or secure; fits the audience (already on Discord for notifications); sessions stored in the same Neon DB — no extra service. Free. |
| **Hosting** | Vercel (Hobby tier) | Free at this scale; pairs naturally with Next.js; one deploy target for frontend + API routes. |
| **Background job trigger** | Vercel Cron, falling back to a free GitHub Actions scheduled workflow hitting a protected API route if Vercel's free-tier cron granularity is too coarse for "check every 15-30 min for accounts whose `next_poll_at` has passed" (verify the actual Hobby-tier limit when building — don't assume) | Either way: $0. The route itself does the real work (query due accounts, poll Riot, upsert `skin_sighting_stats`, dispatch notifications) — the trigger is just what wakes it up. |
| **Images/video** | Direct URLs to valorant-api.com's CDN, rendered through Next.js's built-in image optimization/caching | We never re-host or mirror their assets ourselves — no S3/R2/object-storage bill, and it's the "good citizen" behavior `RISKS.md` already commits to. |
| **Color extraction** | A JS color-quantization library, run server-side during the sync job | Pure compute, no external API, no cost beyond the sync job's own runtime. |
| **Vibe tagging** | A vision-capable LLM API call, ingest-time only (new skins/chromas, not re-run on unchanged items) | The one real recurring cost in the stack — small, because it only runs at Riot's release cadence (a few hundred calls/year), not per request. |
| **Notification dispatch** | Plain outbound HTTP POST to a Discord webhook URL | No service, no SDK needed, free and effectively unlimited at this volume. Written behind a small `channel` abstraction (per `notifications_sent.channel`) so email/push can be added post-v1 without touching detection/dedup logic. |
| **Secrets/encryption** | Env vars (`.env.local`, never committed) + Node's built-in `crypto` (AES-256-GCM) for encrypting linked-account tokens at rest, keyed by `RIOT_TOKEN_ENCRYPTION_KEY` | No separate secrets-management service needed at this scale; matches the non-negotiables in `CLAUDE.md`. |

**Why one relational database and not a combination (Postgres + Mongo, or + Redis):** every table in this app has real structure and real relationships that need enforcing (a `loadout_item` must point at a `skin` that exists; gallery filtering means combining several facets — weapon, tier, color, vibe — in one query). That's exactly the workload relational databases are built for, and the data volume here (~15-20k catalog rows, user data scaling with actual usage) never approaches the point where NoSQL's tradeoffs (schema flexibility for wildly varying documents, horizontal write scaling) would pay for themselves. A second datastore would mean paying for and operating two services instead of one, for a data shape that doesn't need the split — directly working against the cost goal. Revisit only if a real bottleneck shows up (e.g. Postgres + Next.js ISR caching genuinely can't keep the gallery fast), not preemptively.

The one piece worth keeping regardless of any future stack changes: the store-check subsystem stays isolated from the app/content layers (see below).

## Data model (sketch)

- `users` — id, email, auth info, created_at
- `linked_riot_accounts` — id, user_id, encrypted session token/cookie (never raw password), region/shard, last_synced_at, next_poll_at (derived from the account's own shop reset time, not a blind interval), status (active/expired/error/captcha_blocked), discord_webhook_url
- `skins` — id (`uuid` from valorant-api.com), weapon, name (`displayName`), tier/rarity (`contentTierUuid`), collection (`themeUuid` — confirmed the right field for this, not `bundles`), display_icon_url (`displayIcon`), price_vp_estimate (**not synced** — looked up from the static tier-price table at read time, see below), first_seen_in_sync_at (our own timestamp — see release-date note below), color_family (extracted from the base/first chroma's image) — synced, not user-editable. No `video_url`/`release_date` columns: video lives on levels/chromas individually (below), and valorant-api.com has no release-date field at all.
- `skin_levels` — id, skin_id, level_index, display_icon_url (nullable — confirmed some levels have none), video_url (nullable — confirmed most levels don't have one; `levelItem` from the API also gets stored, a raw enum like `EEquippableSkinLevelItem::SoundEffects` worth mapping to friendly text for the level-selector UI) — a skin's upgrade tiers, needed for the detail-page level selector
- `skin_chromas` — id, skin_id, display_icon_url, swatch_color (nullable — confirmed the base/default chroma usually has no swatch image; color extraction falls back to `fullRender`/`displayIcon` when swatch is missing), color_family (extracted, per-chroma — a color filter match can come from any chroma, not just the default), video_url (nullable) — color variants, needed for the detail-page swatch swap
- `skin_vibe_tags` — skin_id, tag (e.g. "dark", "sleek", "futuristic") — many-to-many, AI-assigned at sync time (see below); a skin can carry several tags
- `buddies` — id (from valorant-api.com), name, display_icon_url — synced, not user-editable
- `buddy_levels` — id, buddy_id, charm_level, display_icon_url — confirmed buddies have their own level progression too (charm growth stages), no video
- `loadouts` — id, user_id, name, created_at, is_shareable (bool, opt-in per loadout), share_slug (nullable, unguessable — regenerated on revoke)
- `loadout_items` — loadout_id, weapon_slot, skin_id, level_id, chroma_id, buddy_id
- `wishlist_items` — user_id, skin_id, added_at
- `skin_sighting_stats` — linked_riot_account_id, skin_id, first_seen_at, last_seen_at, times_seen — one row per (account, skin) ever seen in that account's shop, **upserted** on every poll for every skin observed that day (not just wishlist matches). Bounded by catalog size (at most ~1 row per skin that ever exists, per account), not by time — grows to a ceiling and stops, unlike a per-day log. Powers "last seen N days ago" / "seen N times since you signed up."
- `notifications_sent` — id, user_id, skin_id, channel, sent_at (dedupe so the same rotation doesn't notify twice — check for an existing row since the account's last reset before sending)

## Store-check subsystem detail

This is the part that carries actual risk (see `RISKS.md`) and deserves care:

- **Auth flow (Riot Sign-On style, same path the game client uses):**
  1. Submit credentials to Riot's auth endpoint → access token + ID token.
  2. If the account has email 2FA enabled, Riot returns a multifactor challenge — the linking UI needs a code-entry step here, not just a password box (see `PRD.md`).
  3. Exchange the access token for an entitlements token, then a region/shard (PAS) token — the shop endpoint is region-specific, so the resolved shard gets stored on `linked_riot_accounts`.
  4. Call the storefront endpoint for the account's current shop (skin IDs only — see data minimization below).
  5. Discard the raw password immediately after step 1; persist only the resulting tokens, encrypted at rest.
  6. Access tokens expire in roughly an hour — refresh silently using the stored session token on each poll. If refresh fails, mark the link `expired` and prompt re-link; don't retry-loop against Riot's auth servers.
- **CAPTCHA / hard-block handling:** Riot's auth endpoint can return a CAPTCHA challenge on some accounts or after repeated attempts — this unofficial flow cannot solve it. Mark the link `captcha_blocked` and surface that plainly to the user rather than retrying (retrying is exactly the "aggressive polling" pattern `RISKS.md` warns about).
- **Polling cadence:** one poll per account per day — the shop only resets once daily, so there's nothing to gain from checking more often. The storefront response includes when that account's shop next resets; store that as `next_poll_at` and poll shortly after it, jittered per account so many accounts don't all hit Riot at the same moment. If that scheduled poll fails (network error, Riot-side hiccup), a bounded retry with backoff later the same day is reasonable — but that's an exception path, not the routine cadence.
- **Data minimization:** only fetch and store what's needed to detect wishlist matches and update `skin_sighting_stats` (current shop skin IDs), not a full account/inventory dump, unless a feature actually needs it.
- **What "the shop" means here:** each account's storefront is (as of writing) 4 skin offers, replaced wholesale on that account's own ~24h reset cycle — once a rotation passes, those specific offers aren't purchasable again until they're randomly re-rolled some future day. This is public knowledge about the game, not something confirmed against a live API response — verify the actual storefront response shape (field names, offer count, reset-time field) against a real call when this phase is built, the same caution already applied to valorant-api.com. Note this is a different rotation from the Night Market or the accessory (buddy/spray) store, both out of v1 scope.

## Skin/animation assets

Schema confirmed against the live API on 2026-08-28 (`weapons`, `weapons/skins`, `weapons/skinchromas`, `weapons/skinlevels`, `buddies`, `contenttiers`, `themes`, `bundles`). Re-verify again before building if much time has passed — this is still an unofficial, unversioned API. It covers weapons, skins, chromas, levels, buddies, content tiers, themes, and bundles, with image assets per item; video (`streamedVideo`) lives on individual levels and chromas, not a single field per skin, and is frequently absent even where you'd expect it (only some levels/chromas have it). Cache/mirror what's needed (image and video URLs, keyed by id) rather than hitting valorant-api.com on every page load — it's a shared community resource, be a good citizen of it.

**Two gaps confirmed by directly probing the API — nothing hidden, just doesn't exist here:**

- **No VP price data anywhere** (not on skins, bundles, or weapons; probed for a dedicated prices/offers endpoint directly — none exists). **Resolution:** a small static `content_tier_id -> estimated_vp_price` lookup table (Select/Deluxe/Premium/Ultra/Exclusive have had fairly stable prices historically), not a per-skin DB column. Surfaced in the UI as an estimate, not a guarantee. **Stretch goal:** once Phase 3's authenticated Riot session exists, real prices are available from the same internal storefront endpoint already being called for shop tracking — could backfill/replace the estimates for skins that session happens to expose pricing for. Not blocking v1.
- **No release date anywhere** (not on skins, themes, or bundles). **Resolution:** `first_seen_in_sync_at`, our own timestamp recorded the first time the sync job encounters a given skin id. This is accurate going forward — valorant-api.com updates promptly when Riot ships new content, so newly-added skins get a real date. The one-time backfill of the existing ~1400 skins won't have meaningful historical ordering from this field alone (they'll mostly share the date of our first sync run); be upfront about that rather than presenting false precision — "newest first" sort is exact for anything released after this project starts syncing, approximate for the historical catalog.

**No 3D model data exists in this or any other legitimate source.** A true drag/rotate 3D inspect view was considered and explicitly declined for that reason — see `RISKS.md`. Presentation stays 2D/video: high-res images, animation clips where available, zoom/transition polish.

**Buddy-on-weapon rendering:** buddies attach as a 2D overlay at a per-weapon anchor point (roughly where the strap/grip is), not a separate rendering pipeline. This means each weapon needs a calibrated anchor coordinate (and maybe scale) stored somewhere — likely a small static config (`weapon_id -> {x, y, scale}`) rather than a DB table, since it's a design constant per weapon, not user data.

**Gallery performance:** the catalog is large enough (1500+ skins across years, plus levels/chromas as separate rows) that the gallery grid needs virtualization and lazy-loaded images from day one, not as a later optimization. Video should not autoplay across an entire grid of results — load/play on hover or on opening the detail view only, both for user bandwidth and so we're not hammering valorant-api.com's CDN.

**Color and vibe tagging pipeline (runs as part of the sync job, per new skin/chroma only — not re-run on unchanged items):**

- **Color:** extract a dominant-color bucket (red/blue/black/white/gold/multicolor/etc.) from each skin's and each chroma's display image via a standard color-quantization pass (e.g. k-means over image pixels). Deterministic, no external API, cheap to (re)run.
- **Vibe:** send each skin's showcase image to a vision-capable model once at sync time, asking it to assign vibe tags from a fixed vocabulary (not freeform, so filters stay consistent — e.g. a controlled list like dark/sleek/futuristic/elegant/aggressive/cute/retro/neon/anime/nature/gold/minimal). Store the result in `skin_vibe_tags`; never re-tag on every request. This is an ingest-time cost (one call per new skin, maybe a few hundred/year at Riot's release cadence), not a runtime one.
- Both are best-effort classification, not ground truth — fine for a browse/filter feature, not something any other feature should depend on for correctness.

## Sharing

Both link types are read-only, need no viewer login, and stay entirely inside the app/content layers — no interaction with Riot's endpoints, no new risk profile.

- **Loadout links** (`/l/:share_slug`): the loadout is a real persisted row, so the link is opt-in (`is_shareable` flag) and points at `share_slug`, an unguessable id separate from the internal primary key — don't expose the internal id, so revoking/regenerating the slug is enough to kill an old link without touching the loadout itself. The page renders the loadout's live current state; no snapshot/versioning system needed for v1 — simplest option, revisit only if "the link changed on me" becomes an actual complaint.
- **Combo links** (`/combo/:encoded`): fully stateless — `:encoded` is the skin/level/chroma/buddy IDs packed into the URL itself (e.g. base62 or a short delimited string), not a database row. The route just parses the URL and renders the same skin-detail-with-buddy-overlay component the gallery already has. No auth, no save step, nothing to revoke.
- Neither route needs rate-limiting beyond normal web-app hygiene — they only ever touch our own DB/content cache, never Riot's endpoints.

## Security notes

- Encrypt linked-account tokens at rest; scope access to the store-check subsystem only.
- Never log raw credentials or tokens, including in error reporting.
- Rate-limit and monitor outbound calls to Riot's endpoints from our own infra so a bug can't turn into an accidental hammering incident.
