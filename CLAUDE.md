# CLAUDE.md

Guidance for Claude when working in this repo. Read this first, every session.

## Project

**Valoadout** — a webapp for VALORANT cosmetics. Build your ideal loadout across every weapon, wishlist skins you want, browse every skin and animation ever released in a UI that actually shows them off, and get notified when a wishlisted skin shows up in your daily store.

**Status: Phases 1–3 feature-complete.** The gallery, loadout builder, sharing, Discord auth, the Riot store-check subsystem, the wishlist and notification dispatch all exist, and the store-check subsystem is verified end-to-end against live Riot. Two things are built but not yet verified against live conditions: Discord notification delivery, which no-ops until a bot token and guild id are supplied, and whether Riot's Cloudflare permits the poller from a datacenter IP. See `docs/ROADMAP.md` Phase 3.

Don't assume any framework, package, or file structure beyond what's written in these docs — propose a change to the docs before writing code that contradicts them.

## Read these before building anything

- `docs/PRD.md` — what we're building and for whom, feature scope, what's out of scope
- `docs/ARCHITECTURE.md` — stack, data model, and how each subsystem actually works
- `docs/ROADMAP.md` — build order and what's still open
- `docs/RISKS.md` — the ToS and account-risk tradeoffs this project has accepted, and the guardrails that follow

## Decisions already made (don't relitigate without flagging it)

- **Store notifications use the unofficial route.** Riot's official developer API does not support store/shop tracking. This project reads a user's live shop the same way community tools do: the same internal endpoints the game client calls, as the user. Never propose "just use the official API for this" — the capability doesn't exist there. See `docs/RISKS.md`.
- **…but via Riot's OAuth flow, never a password.** Password login requires an hCaptcha token, so it's CAPTCHA-gated for every account. The app never receives a password: the user signs in on Riot's own page and pastes back the redirect address, and we exchange the single-use code for a refresh token, AES-256-GCM encrypted at rest. Don't "restore" a password flow — it can't work without solving a CAPTCHA, which this project won't do. Corollary: any 2FA/code-entry requirement is moot, since we never trigger a challenge.
- **Riot rotates the refresh token on every use.** Concurrent refreshes invalidate each other and permanently kill the link. That's what `refreshLockedUntil` guards — don't remove the lock.
- **No bot-detection evasion, ever.** Riot fronts these endpoints with Cloudflare. No proxy rotation, no TLS-fingerprint spoofing, no CAPTCHA solving. Running the poller somewhere that isn't blocked (`npm run check-shops` on a residential connection) is supported; routing around a block is not. If keeping this feature alive ever requires active evasion, that's the signal to drop the feature — which is why the module is isolated.
- **Skin/cosmetic metadata comes from valorant-api.com**, a free, unofficial, community-maintained mirror of Riot's game data. Confirm exact fields against the live API rather than assuming the schema from memory.
- **Notifications are a Discord bot DM, not a per-user webhook.** A bot can't DM a user it shares no server with, so every Discord sign-in also joins the user to this app's own server (`guilds.join` scope + `PUT /guilds/{id}/members/{id}`). That's what makes "automatic, no setup step" possible at all. Don't reintroduce a webhook-URL field as "simpler" — a webhook is a manual setup step and doesn't meet the requirement. See `docs/ARCHITECTURE.md` → "Notifications subsystem".
- **This project is not affiliated with or endorsed by Riot Games.** Say so in the UI.

## Non-negotiables

- **A secret only ever exists in a gitignored env file, and nowhere else.** Not in a tracked file, not in a doc, not in a code comment, not in an example, not in a test fixture, not in a commit message, not in a script's default value, and not echoed into terminal output that gets pasted somewhere. The only homes for a real value are `.env.local` / `.env.*.local` (gitignored) and the hosting platform's own environment-variable store. This covers anything that authenticates or decrypts: database URLs, `RIOT_TOKEN_ENCRYPTION_KEY`, `AUTH_SECRET`, `CRON_SECRET`, OAuth client secrets, bot tokens, API keys.
  - Tracked files may name a variable, never its value. `.env.example` lists keys with empty values, and that is the pattern everywhere else too.
  - If a real credential ever ends up in a tracked file, **stop and say so before committing**. Once pushed to a public repo it must be treated as compromised and rotated, not quietly deleted — deleting it from the tip does not remove it from history.
  - When a script must display a generated credential (e.g. `setupAppRole.ts` printing a new connection string), it prints to the operator's terminal only. Never write that output to a file in the repo.
- **Never commit a value that maps to something real — secret or not, code or comment.** The secrets rule above covers things that authenticate. This one covers everything that *identifies*: hostnames, endpoint ids, project ids, branch ids, database names, connection strings, account ids, user ids, Discord snowflakes, dashboard URLs, email addresses. A real value is no less real for sitting in a `//` comment, a doc, a worked example, a test fixture, or a default argument.
  - The test is mechanical: **did this value come from copying something that exists?** If yes, it does not go in a tracked file, however harmless it looks. A hostname cannot be used to authenticate, but it names the live system, which is what turns any future slip into something immediately actionable.
  - Use values that are impossible to mistake for real ones: `<endpoint-id>`, `example.invalid`, `127.0.0.1:1`, an all-`z` cuid. A placeholder that *looks* plausible is worse than none, because nobody re-checks it.
  - **This is not undoable, so it has to be prevented.** `refs/pull/N/head` keeps every commit of every pull request readable forever, and a merged PR's head has the whole base branch as ancestors. Once a real value has been in a repo that has ever had a PR, rewriting history does not remove it — it stays reachable at those refs, which only GitHub Support can delete. "We can scrub it later" is false.
  - Before committing, re-read added comments and examples specifically for this. It is the one class of leak that review naturally skips, because a comment reads as prose rather than as data.

- **Never store a user's raw Riot password.** Persist only the OAuth refresh token, encrypted at rest.
- **Rate-limit anything that talks to Riot.** Poll per-user shop state a few times a day at most, and back off hard on errors. This isn't just politeness — aggressive polling is what gets unofficial integrations noticed.
- **Treat the store-check subsystem as an isolated, swappable module.** If Riot's endpoints change or the approach becomes untenable, the gallery, loadout builder and wishlist must keep working with that one piece disabled.
- **The app's `DATABASE_URL` connects as a least-privilege role, not the Neon owner role.** `DIRECT_URL` (Prisma CLI and migrations only) stays on the owner role. Don't "simplify" by pointing the app at the owner role — see `docs/RISKS.md`, and `src/scripts/setupAppRole.ts` to provision the role on a new database.
- **Discord OAuth tokens are deliberately never persisted.** `src/lib/authAdapter.ts` strips `refresh_token`/`access_token`/`id_token`/`session_state` before the row is written, and nothing in this app reads them back. Don't add a feature that reads them from the database without re-reading `docs/RISKS.md` first.

## Docs describe the software, not how it was built

Every tracked doc and code comment is reference material for someone reading
the code today. **Record what is true now, never the story of arriving at it.**

Rationale is welcome — it is what stops a decision being re-litigated. The line
is between *why the software is this way* and *what happened while building
it*:

| Keep | Cut |
| --- | --- |
| "Buddies are not composited onto the weapon render: the two images are flat and their perspectives do not match, so it reads as a sticker." | "An earlier approach composited the buddy icon on. That version is in git history." |
| "Every null in the catalog is also null at the source; row counts match exactly." | "Every null was checked field-by-field against the live API, and no row exists upstream that we failed to store." |
| "`NODE_ENV` cannot select the production database: it means 'optimized build', and `next build` sets it locally too." | "This check used to trust `NODE_ENV`, which turned out to be wrong — see the incident write-up." |

Concrete tells, all of which mean rewrite:

- Dates, incident narrative, post-mortems, "this was caught before shipping"
- Prior-state narration: "an earlier version", "used to", "previously",
  "originally", "this replaces"
- First-person process voice: "we tried", "we discovered", "it turned out",
  "at first"
- Describing an *investigation* rather than its *conclusion*
- Announcing a change rather than stating the behaviour: "now runs on the query
  path" → "runs on the query path"

**Measurements about the code are not narrative and should stay.** "884 rows
with every column, ~186 KB per page view" describes the software. "This
exhausted the monthly allowance" describes the deployment — that belongs in the
gitignored operations notes, not the repo.

The same applies to comments explaining a fix: state the rule the code now
follows and why it is not obvious, not the bug that prompted it. A reader who
needs the history has `git log`; a reader of the file needs the invariant.

## Working conventions

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build (also type-checks). Runs `prisma generate` first, and must keep doing so: `src/generated/prisma` is gitignored, so any build from a fresh clone — every Git-triggered Vercel deploy — has no client and fails with `Can't resolve '@/generated/prisma/client'`. A CLI `vercel deploy` uploads the local directory and masks this, so it can pass while the Git integration fails
- `npm run lint` — ESLint
- `npx tsc --noEmit` — type-check only
- `npx prisma generate` — regenerate the Prisma client after any `prisma/schema.prisma` change. Output goes to `src/generated/prisma` (gitignored); import from `@/generated/prisma/client`, not the bare path — there's no barrel file
- `npx prisma migrate dev` — create and apply a migration (needs a real `DIRECT_URL`). It refuses to run non-interactively, so when a change triggers a warning prompt, generate the SQL with `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --config prisma.config.ts`, write it to `prisma/migrations/<timestamp>_<name>/migration.sql` by hand, then `npx prisma migrate deploy`
- `npm test` — unit tests via Node's built-in runner (no Jest/Vitest). Two categories, both narrow on purpose:
  1. **Security controls where a silent regression would be worst** — encryption, OAuth parsing, the auth adapter, the environment check, the per-user limits.
  2. **Failures the compiler structurally cannot catch.** `src/queries/queryShapes.test.ts` executes every query function against an unreachable database to prove Prisma accepts the query's *shape*; Prisma validates arguments client-side, so this needs no database, fixtures or network. It exists because a Prisma *select* object passed to an `include` position type-checks cleanly (excess property checking fires only on fresh object literals) and fails only on a real page load. `src/queries/payloadBudget.test.ts` is the same idea by static scan.

  Add tests in those categories; don't chase coverage on UI or glue code. A new function in `src/queries/` must be exercised in `queryShapes.test.ts` or listed in its `NOT_EXERCISABLE` map with a reason — the test fails otherwise, so coverage cannot erode silently
- `npm run check-shops` — run the store-check poll for every account whose `nextPollAt` has passed (the same job as `/api/cron/check-shops`)

**Restart `npm run dev` after any schema change.** The dev server holds a generated Prisma client in memory and does not pick up a regenerated one on hot reload. The error never names the real cause — symptoms include `Unknown argument` on a field that clearly exists, and `The column '(not available)' does not exist in the current database` on a column that was just dropped. Before debugging either, run the same query from a fresh `tsx` script; if that works, the code is fine and the server is stale.

**Local setup:** copy `.env.example` to `.env.local` and fill in real values. `DATABASE_URL` (pooled) and `DIRECT_URL` (direct) both need a real Neon project — the CLI uses `DIRECT_URL` via `prisma.config.ts`, the app uses the pooled `DATABASE_URL` via `src/lib/db.ts`. Nothing works end-to-end without a real database; don't stub around it. `DISCORD_BOT_TOKEN`/`DISCORD_GUILD_ID` are the exception — optional at the code level (`src/discord/bot.ts` no-ops without them), needed only to actually see notifications fire.

**After the first `prisma migrate deploy` against any new database**, run `npx tsx src/scripts/setEnvironmentMarker.ts <development|production>` against it once, and provision the least-privilege app role with `src/scripts/setupAppRole.ts`. The app refuses to start if `NODE_ENV` and the marker disagree, which turns a `DATABASE_URL` copy-pasted into the wrong place into an immediate crash instead of silently mixed data. Skipping the marker only means the check warns and does nothing — safe to defer, not safe to forget on a production database.

**The parent directory holds an unrelated `package-lock.json`** from other projects sharing that folder. `next.config.ts` pins `turbopack.root` so Turbopack doesn't get confused by it — don't remove that config.

## Open questions

- Whether skin "animation" playback means the hosted showcase clips valorant-api.com exposes for some tiers, or something more produced. Start with what the API gives for free; treat anything fancier as a stretch goal.
- **Where the shop-check poller runs.** Vercel Cron is ruled out on the free tier: Hobby accounts allow only once-daily schedules, and once daily is too coarse here because shop resets are per-account and spread across the day. The open choice is a scheduled GitHub Actions workflow versus `npm run check-shops` on a non-datacenter machine, and it can't be settled until the datacenter-IP question is answered. See `docs/ARCHITECTURE.md` → "Store-check subsystem".
