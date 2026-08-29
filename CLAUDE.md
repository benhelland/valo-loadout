# CLAUDE.md

Guidance for Claude (Claude Code / Cowork) when working in this repo. Read this first, every session.

## Project

**valo-loadout** — a webapp for VALORANT cosmetics. Build your ideal loadout across every weapon, wishlist skins you want, browse every skin/animation ever released in a UI that actually shows them off, and get notified when a wishlisted skin shows up in your daily store.

**Status: Phase 1 done except deployment; Phase 2 loadout builder in progress** (see `docs/ROADMAP.md`). Phase 1 (sync job + skin gallery) is built and verified; deploying it was explicitly deferred until Phase 2 is further along. The loadout builder is built and working against a **mock user** (`src/lib/auth.ts`'s `getCurrentUserId()`) — real auth (Auth.js + Discord OAuth) hasn't been built yet, on explicit call: feature first, accounts after. Every loadout query/action goes through that one function, so swapping in a real session later is a one-function change. The project is scaffolded: Next.js + TypeScript + Tailwind, Prisma schema written and matching `docs/ARCHITECTURE.md`. See `docs/` for the full thinking. Do not assume any framework, package, or file structure beyond what's written down in these docs — propose changes to the docs themselves before writing code that contradicts them.

## Read these before building anything

- `docs/PRD.md` — what we're building and for whom, feature list, what's out of scope
- `docs/ARCHITECTURE.md` — proposed stack, data model, and how the store-notification piece actually works
- `docs/ROADMAP.md` — build order (phases), so we don't try to build store notifications before there's a gallery
- `docs/RISKS.md` — the ToS/ban-risk tradeoffs this project has already accepted, and the guardrails that decision implies

## Decisions already made (don't relitigate without flagging it)

- **Store notifications use the unofficial route.** Riot's official developer API explicitly does not support store/shop tracking. This project reads a user's live shop the same way community tools (e.g. SkinPeek) did: authenticate as the user via Riot's login flow and call the same internal endpoints the game client uses. This is a deliberate, accepted tradeoff — see `docs/RISKS.md`. Never propose "just use the official API for this" as a fix; the capability doesn't exist there.
- **Skin/cosmetic metadata comes from valorant-api.com**, a free, unofficial, community-maintained mirror of Riot's game data (images, and video/animation assets for some skin tiers — confirm exact fields against the live API when this is built, don't assume the schema from memory).
- **This project is not affiliated with or endorsed by Riot Games.** Say so in the UI (footer/about) once there is a UI.

## Non-negotiables

- **Never commit secrets.** Riot session tokens/cookies, database URLs, notification service keys — all via environment variables, all covered by `.gitignore`. If you ever write a real credential into a file in this repo, stop and flag it instead of committing.
- **Never store a user's raw Riot password.** Only ever handle it in-memory for the length of the auth handshake (or better, use cookie/token-based re-auth so the password is never touched by our servers at all). Persist only the resulting session token, encrypted at rest.
- **Rate-limit anything that talks to Riot's servers.** Poll per-user shop state on a sane interval (think: a few times a day, not continuously) and back off hard on errors. This isn't just politeness — aggressive polling is the kind of behavior that gets unofficial integrations noticed.
- **Treat the store-checking subsystem as an isolated, swappable module.** If Riot's internal endpoints change, get locked down, or this approach becomes untenable, the rest of the app (gallery, loadout builder, wishlist) should keep working with that one piece disabled.

## Working conventions

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build (also type-checks)
- `npm run lint` — ESLint
- `npx tsc --noEmit` — type-check only
- `npx prisma generate` — regenerate the Prisma client after any `prisma/schema.prisma` change (output goes to `src/generated/prisma`, gitignored — import from `@/generated/prisma/client`, not the bare `@/generated/prisma` path, since there's no barrel file)
- `npx prisma migrate dev` — create/apply a migration in dev (needs a real `DIRECT_URL` in `.env.local` — see below)
- No test runner yet — add one when there's real logic worth testing (the sync job, pricing lookup, etc.), not before

**Local setup:** copy `.env.example` to `.env.local` and fill in real values. `DATABASE_URL` (pooled) and `DIRECT_URL` (direct) both need a real Neon project — the CLI (`prisma migrate`, `prisma studio`) uses `DIRECT_URL` via `prisma.config.ts`, the app itself uses the pooled `DATABASE_URL` via `src/lib/db.ts`. Nothing in this repo works end-to-end without a real Neon database provisioned — that's on the user to create (free tier), not something to fake or stub around.

**Repo root has a stray, unrelated `package-lock.json` one level up** (from other projects sharing the parent `projects/` folder) — `next.config.ts` pins `turbopack.root` to avoid Turbopack getting confused by it. Don't remove that config.

## Open questions to resolve before/while building

- Whether skin "animation" playback means the hosted showcase video clips valorant-api.com exposes for some tiers, or something more produced (custom-captured/rendered) — start with what the API gives us for free, treat anything fancier as a stretch goal
- Exact Vercel Hobby-tier cron granularity (affects whether the store-check poll trigger uses Vercel Cron directly or a GitHub Actions workflow as a free fallback — see `docs/ARCHITECTURE.md`)

**Reprompt the user: set up `ANTHROPIC_API_KEY`.** Vibe-tagging (`src/lib/vibeTagging.ts`) is written and type-checks but has never been run against the live API — the user deferred it since it needs its own Developer-API billing (console.anthropic.com, pay-as-you-go, separate from their Claude subscription). Bring this up again next time Phase 1 or the sync job comes up, so it actually gets verified. Estimated cost: ~$1-3 one-time backfill, pennies/year after.

Resolved: stack is locked in (`docs/ARCHITECTURE.md`) — Next.js + TypeScript + Tailwind, Postgres via Neon + Prisma, Auth.js with Discord OAuth, Vercel hosting, Discord webhook notifications.
