# CLAUDE.md

Guidance for Claude (Claude Code / Cowork) when working in this repo. Read this first, every session.

## Project

**valo-loadout** — a webapp for VALORANT cosmetics. Build your ideal loadout across every weapon, wishlist skins you want, browse every skin/animation ever released in a UI that actually shows them off, and get notified when a wishlisted skin shows up in your daily store.

**Status: pre-code / scoping.** Nothing has been scaffolded yet. See `docs/` for the current thinking. Do not assume any framework, package, or file structure beyond what's written down in these docs — propose changes to the docs themselves before writing code that contradicts them.

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

(To be filled in once the stack is chosen and scaffolded — see `docs/ARCHITECTURE.md` for the current proposal. Update this section with real commands — dev server, test runner, lint, build — as soon as they exist, so future sessions don't have to rediscover them.)

## Open questions to resolve before/while building

- Whether skin "animation" playback means the hosted showcase video clips valorant-api.com exposes for some tiers, or something more produced (custom-captured/rendered) — start with what the API gives us for free, treat anything fancier as a stretch goal
- Exact Vercel Hobby-tier cron granularity (affects whether the store-check poll trigger uses Vercel Cron directly or a GitHub Actions workflow as a free fallback — see `docs/ARCHITECTURE.md`)

Resolved: stack is locked in (`docs/ARCHITECTURE.md`) — Next.js + TypeScript + Tailwind, Postgres via Neon + Prisma, Auth.js with Discord OAuth, Vercel hosting, Discord webhook notifications.
