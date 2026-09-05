# CLAUDE.md

Guidance for Claude (Claude Code / Cowork) when working in this repo. Read this first, every session.

## Project

**valo-loadout** — a webapp for VALORANT cosmetics. Build your ideal loadout across every weapon, wishlist skins you want, browse every skin/animation ever released in a UI that actually shows them off, and get notified when a wishlisted skin shows up in your daily store.

**Status: Phases 1–3 feature-complete; not deployed** (see `docs/ROADMAP.md`). The gallery, loadout builder, sharing, real Discord auth, the Riot store-check subsystem, the wishlist, and notification dispatch all exist. **The store-check subsystem is verified end-to-end against live Riot** (2026-08-31): a real account linked via OAuth, the storefront returned its four daily offers, all four resolved to catalog skins, and the refresh-token grant + rotation path was exercised separately. **Notifications are a Discord bot DMing the user directly, not a webhook** — see `docs/ARCHITECTURE.md` "Notifications subsystem detail" for why (a webhook URL is a manual setup step; the requirement was automatic off signup + Riot-link alone) — built and type/lint/build clean, verified in the browser that wishlisting itself works end-to-end, but **the actual Discord delivery path (guild auto-join, DM send) is not yet verified against a real bot/server** — needs `DISCORD_BOT_TOKEN`/`DISCORD_GUILD_ID` provisioned first (hand-off note in `ARCHITECTURE.md`); until then it no-ops safely rather than erroring. Outstanding: **(1)** nothing is deployed yet — deferred deliberately, see `docs/LAUNCH_CHECKLIST.md`; **(2)** everything Riot-side so far has run from a residential IP, and whether Cloudflare permits this from a datacenter IP (i.e. Vercel Cron) is still unanswered — see "Where the poller runs" in `ARCHITECTURE.md`. See `docs/` for the full thinking. Do not assume any framework, package, or file structure beyond what's written down in these docs — propose changes to the docs themselves before writing code that contradicts them.

## Read these before building anything

- `docs/PRD.md` — what we're building and for whom, feature list, what's out of scope
- `docs/ARCHITECTURE.md` — proposed stack, data model, and how the store-notification piece actually works
- `docs/ROADMAP.md` — build order (phases), so we don't try to build store notifications before there's a gallery
- `docs/RISKS.md` — the ToS/ban-risk tradeoffs this project has already accepted, and the guardrails that decision implies

## Decisions already made (don't relitigate without flagging it)

- **Store notifications use the unofficial route.** Riot's official developer API explicitly does not support store/shop tracking. This project reads a user's live shop the same way community tools (e.g. SkinPeek) did: call the same internal endpoints the game client uses, as the user. This is a deliberate, accepted tradeoff — see `docs/RISKS.md`. Never propose "just use the official API for this" as a fix; the capability doesn't exist there.
- **…but specifically via Riot's OAuth flow, never a password.** The originally-documented username/password flow was checked against the live API and is dead: it now requires an hCaptcha token, so it's CAPTCHA-gated for every account. The app never receives a password. The user signs in on Riot's own page and pastes back the redirect address; we exchange the single-use code for a **refresh token**, encrypted (AES-256-GCM) at rest. Don't "restore" the password flow — it can't work without solving a CAPTCHA, which this project won't do. Corollary: `PRD.md`'s 2FA/code-entry requirement is moot, since we never trigger a 2FA challenge. **Riot rotates the refresh token on every use** — concurrent refreshes invalidate each other and kill the link, which is what `refreshLockedUntil` guards; don't remove that lock.
- **No bot-detection evasion, ever.** Riot fronts these endpoints with Cloudflare. SkinPeek's answer was proxy rotation; ours is not. No proxy rotation, no TLS-fingerprint spoofing, no CAPTCHA solving. Running the poller somewhere that isn't blocked (`npm run check-shops` on a residential connection) is fine and supported; routing around a block is not. If keeping this feature alive ever requires active evasion, that's the signal to drop the feature — which is exactly why the module is isolated.
- **Skin/cosmetic metadata comes from valorant-api.com**, a free, unofficial, community-maintained mirror of Riot's game data (images, and video/animation assets for some skin tiers — confirm exact fields against the live API when this is built, don't assume the schema from memory).
- **Notifications are a Discord bot DM, not a per-user webhook.** A bot can't DM a user it shares no server with, so every Discord sign-in also silently joins the user to this app's own Discord server (`guilds.join` OAuth scope + `PUT /guilds/{id}/members/{id}`) — that's what makes "automatic, no setup step" possible at all. Don't reintroduce a webhook-URL field as "simpler" — it was tried first, in the schema, and dropped specifically because it isn't automatic. See `docs/ARCHITECTURE.md` "Notifications subsystem detail".
- **This project is not affiliated with or endorsed by Riot Games.** Say so in the UI (footer/about) once there is a UI.

## Non-negotiables

- **Never commit secrets.** Riot session tokens/cookies, database URLs, notification service keys — all via environment variables, all covered by `.gitignore`. If you ever write a real credential into a file in this repo, stop and flag it instead of committing.
- **Never store a user's raw Riot password.** Only ever handle it in-memory for the length of the auth handshake (or better, use cookie/token-based re-auth so the password is never touched by our servers at all). Persist only the resulting session token, encrypted at rest.
- **Rate-limit anything that talks to Riot's servers.** Poll per-user shop state on a sane interval (think: a few times a day, not continuously) and back off hard on errors. This isn't just politeness — aggressive polling is the kind of behavior that gets unofficial integrations noticed.
- **Treat the store-checking subsystem as an isolated, swappable module.** If Riot's internal endpoints change, get locked down, or this approach becomes untenable, the rest of the app (gallery, loadout builder, wishlist) should keep working with that one piece disabled.
- **The app's `DATABASE_URL` connects as a least-privilege role (`valo_app`), not the Neon owner role.** `DIRECT_URL` (Prisma CLI/migrations only) stays on the owner role. Don't "simplify" by pointing the app at the owner role again - see `docs/RISKS.md` "What a database breach would actually expose" for why, and `src/scripts/setupAppRole.ts` to (re)provision the role for a new database.
- **Discord OAuth tokens (`accounts.refresh_token`/`access_token`/`id_token`/`session_state`) are deliberately never persisted** — `src/lib/authAdapter.ts` strips them before the row is written. Nothing in this app reads them back; don't add a feature that reads them from the database without first re-reading `docs/RISKS.md`'s reasoning, since restoring that would reintroduce a stored credential this project specifically removed.

## Working conventions

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build (also type-checks)
- `npm run lint` — ESLint
- `npx tsc --noEmit` — type-check only
- `npx prisma generate` — regenerate the Prisma client after any `prisma/schema.prisma` change (output goes to `src/generated/prisma`, gitignored — import from `@/generated/prisma/client`, not the bare `@/generated/prisma` path, since there's no barrel file)
- `npx prisma migrate dev` — create/apply a migration in dev (needs a real `DIRECT_URL` in `.env.local` — see below). Note it refuses to run non-interactively; when a change triggers a warning prompt (e.g. adding a unique constraint), generate the SQL with `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --config prisma.config.ts`, write it into `prisma/migrations/<timestamp>_<name>/migration.sql` by hand, then `npx prisma migrate deploy`
- `npm test` — unit tests via Node's built-in runner (no Jest/Vitest dependency). Currently covers `src/lib/crypto.ts` and `src/riot/oauth.ts` — the two security controls where a silent regression would be worst. Add tests for logic in that category; don't chase coverage on UI or glue code
- `npm run check-shops` — run the Riot store-check poll for every account whose `nextPollAt` has passed (same job as the `/api/cron/check-shops` route; see `docs/ARCHITECTURE.md` on why there are two triggers)

**Restart `npm run dev` after any schema change.** The dev server holds a generated Prisma client in memory and does not pick up a regenerated one on hot reload. This has bitten three separate times in this repo and the error never names the real cause — symptoms have included `Unknown argument` on a field that clearly exists, and `The column '(not available)' does not exist in the current database` on a column that was just dropped. Before debugging either, confirm it's not just a stale process: run the same query from a fresh `tsx` script, and if that works, the code is fine and the server is stale.

**Local setup:** copy `.env.example` to `.env.local` and fill in real values. `DATABASE_URL` (pooled) and `DIRECT_URL` (direct) both need a real Neon project — the CLI (`prisma migrate`, `prisma studio`) uses `DIRECT_URL` via `prisma.config.ts`, the app itself uses the pooled `DATABASE_URL` via `src/lib/db.ts`. Nothing in this repo works end-to-end without a real Neon database provisioned — that's on the user to create (free tier), not something to fake or stub around. `DISCORD_BOT_TOKEN`/`DISCORD_GUILD_ID` are the exception to "everything must be configured" — they're optional at the code level (`src/discord/bot.ts` no-ops without them), needed only to actually see notifications fire; nothing else in the app depends on them.

**Repo root has a stray, unrelated `package-lock.json` one level up** (from other projects sharing the parent `projects/` folder) — `next.config.ts` pins `turbopack.root` to avoid Turbopack getting confused by it. Don't remove that config.

## Open questions to resolve before/while building

- Whether skin "animation" playback means the hosted showcase video clips valorant-api.com exposes for some tiers, or something more produced (custom-captured/rendered) — start with what the API gives us for free, treat anything fancier as a stretch goal
- Exact Vercel Hobby-tier cron granularity (affects whether the store-check poll trigger uses Vercel Cron directly or a GitHub Actions workflow as a free fallback — see `docs/ARCHITECTURE.md`)

Resolved: stack is locked in (`docs/ARCHITECTURE.md`) — Next.js + TypeScript + Tailwind, Postgres via Neon + Prisma, Auth.js with Discord OAuth, Vercel hosting, Discord bot DM notifications (auto-join via `guilds.join`, not a webhook — see "Decisions already made" above).

Resolved: vibe-tagging (`src/lib/vibeTagging.ts`) is live and backfilled — `ANTHROPIC_API_KEY` is set, and all 1318 real skins have vibe tags (1318/1318, ~$1.15 total spend). See `docs/ARCHITECTURE.md` "Color and vibe tagging pipeline" for the prompt-tuning history and the one real data quirk found (the "Hi-DR0" collection's 8192px renders, now handled by an automatic downscale fallback).
