# Architecture (proposed — not locked in)

This is a starting proposal to build from, not a final decision. Revisit before scaffolding if requirements change.

## High-level shape

```
[valorant-api.com]  --sync job-->  [our DB: skins cache]
                                          |
[browser] <--REST/RPC--> [app server] ---+---> [our DB: users, loadouts, wishlists]
                                          |
                                          +---> [store-check subsystem] <--Riot auth-->[Riot's servers]
                                                        |
                                                        v
                                                 [notification dispatch] --> [email / push / Discord webhook]
```

Three subsystems that should stay loosely coupled:

1. **Content layer** — skin/cosmetic catalog, synced from valorant-api.com. No user data, no auth. Could be static-generated or cached aggressively since it changes on Riot's release cadence, not per-request.
2. **App layer** — accounts, loadouts, wishlists. Standard CRUD web app. Doesn't need to know anything about Riot's internal APIs.
3. **Store-check subsystem** — the one part of this app that touches Riot's unofficial/internal endpoints. Keep this isolated (own module, own error boundaries) so the rest of the app degrades gracefully if this piece breaks or has to be disabled. See `RISKS.md` for why this isolation matters.

## Proposed stack

- **Frontend:** Next.js (React) + TypeScript + Tailwind. Reasoning: strong support for the kind of image/video-heavy, animation-forward UI this needs, good SSR/ISR story for the mostly-static skin gallery, one deploy target with the backend.
- **Backend:** Next.js API routes / route handlers to start — no need for a separate service until the store-check subsystem's polling needs outgrow serverless request/response (see below).
- **Database:** Postgres (e.g. via Supabase, Neon, or Railway) with Prisma as the ORM.
- **Background jobs / polling:** the store-check subsystem needs something that runs on a schedule independent of user requests (poll each linked account's shop a few times a day). A serverless cron (Vercel Cron, or a small dedicated worker process) triggering a queued job per linked account is the likely shape. Avoid polling synchronously inside a user's page load.
- **Hosting:** Vercel for the app; DB hosted separately (see above). Revisit if the background-worker needs outgrow serverless.
- **Notifications:** start with email (simplest to build, e.g. Resend/SendGrid) and/or a Discord webhook per user (cheap, and the exact audience for this app already lives in Discord). Web push is a nice-to-have once the above works.

None of this is required — swap freely if there's a stack preference once building starts. The one piece worth keeping regardless of stack: the store-check subsystem stays isolated from the app/content layers.

## Data model (sketch)

- `users` — id, email, auth info, created_at
- `linked_riot_accounts` — id, user_id, encrypted session token/cookie (never raw password), last_synced_at, status (active/expired/error)
- `skins` — id (from valorant-api.com), weapon, name, tier/rarity, collection, display_icon_url, video_url (nullable), release_date — synced, not user-editable
- `loadouts` — id, user_id, name, created_at
- `loadout_items` — loadout_id, weapon_slot, skin_id, chroma_id, buddy_id
- `wishlist_items` — user_id, skin_id, added_at
- `shop_sightings` — linked_riot_account_id, skin_id, seen_at (log of what's shown up in a user's shop, both for notification-triggering and so a user can see history)
- `notifications_sent` — id, user_id, skin_id, channel, sent_at (dedupe so the same sighting doesn't notify twice)

## Store-check subsystem detail

This is the part that carries actual risk (see `RISKS.md`) and deserves care:

- **Auth:** Riot Sign-On (RSO) style flow — user enters credentials once, we exchange them for session cookies/tokens the same way the official client does, then discard the password. Persist only the resulting token(s), encrypted at rest, with a way to detect and prompt re-auth when they expire.
- **Polling cadence:** a few times a day per account, not continuous. Jitter the schedule per-account rather than hitting Riot's servers for every linked account at the same moment.
- **Failure handling:** if an account's token is invalid/expired, mark it and stop polling it until the user re-links — don't retry-loop against Riot's auth servers.
- **Data minimization:** only fetch and store what's needed to detect wishlist matches (current shop skin IDs), not a full account/inventory dump, unless a feature actually needs it.

## Skin/animation assets

valorant-api.com is unofficial and its exact schema should be re-verified when this is actually built (don't hardcode field names from a description — hit the live API/docs). What's known going in: it covers weapons, skins, chromas, buddies, cards, bundles, agents, with image assets per item, and some skin tiers expose hosted video/animation clips. Cache/mirror what's needed (at minimum image and video URLs, keyed by skin id) rather than hitting valorant-api.com on every page load — it's a shared community resource, be a good citizen of it.

## Security notes

- Encrypt linked-account tokens at rest; scope access to the store-check subsystem only.
- Never log raw credentials or tokens, including in error reporting.
- Rate-limit and monitor outbound calls to Riot's endpoints from our own infra so a bug can't turn into an accidental hammering incident.
